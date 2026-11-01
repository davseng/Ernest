-- Owner-run once in ernest-v011-test, then the verified Production branch.
-- Take a fresh Production Neon recovery checkpoint first. Run the WHOLE file.
-- No records are seeded, copied, deleted or published; no email is sent by SQL.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('sail-031'));
DO $guard$
DECLARE object_name text;
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 FOREACH object_name IN ARRAY ARRAY['users','assets','schema_migrations','sail_voyages','sail_participants','sail_interest','sail_media','sail_positions'] LOOP
  IF to_regclass('public.'||object_name) IS NULL THEN RAISE EXCEPTION 'Missing verified baseline: %',object_name; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE name='030_sail_optional_email.sql') THEN RAISE EXCEPTION 'Verified migration 030 required'; END IF;
 IF to_regclass('public.sail_availability') IS NOT NULL OR to_regclass('public.sail_notifications') IS NOT NULL OR to_regprocedure('public.sail_queue_notification()') IS NOT NULL OR EXISTS(SELECT 1 FROM public.schema_migrations WHERE name='031_sail_timeline_notifications.sql') THEN RAISE EXCEPTION '031 exists or is partial; stop and review rather than replay'; END IF;
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='id') IS DISTINCT FROM 'text' OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sail_voyages' AND column_name='id') IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'Unexpected identity schema'; END IF;
END
$guard$;
-- BEGIN UNCHANGED MIGRATION 031
-- Explicit remaining availability, independent of a voyage's guest-confirmed revision.
CREATE TABLE sail_availability (
 voyage_id uuid PRIMARY KEY REFERENCES sail_voyages(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 crew_needed integer CHECK(crew_needed BETWEEN 0 AND 100),
 passenger_places integer CHECK(passenger_places BETWEEN 0 AND 100),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=400),
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Transactional, minimal owner notifications. Never store guest tokens or raw snapshots.
CREATE TABLE sail_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id),
 voyage_id uuid,
 event_key text UNIQUE NOT NULL,
 summary text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 attempted_at timestamptz,
 sent_at timestamptz
);
CREATE INDEX sail_notifications_pending_idx ON sail_notifications(owner_id,state,created_at);
CREATE FUNCTION sail_queue_notification() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE r jsonb; old_r jsonb; owner uuid; trip uuid; asset text; record_key text; event_revision text; label text;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' THEN
  old_r:=to_jsonb(OLD);
  IF (r-'revision'-'updated_at') IS NOT DISTINCT FROM (old_r-'revision'-'updated_at') THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='sail_media' AND NOT (r->>'ready')::boolean THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_TABLE_NAME='sail_voyages' THEN trip:=(r->>'id')::uuid; ELSE trip:=(r->>'voyage_id')::uuid; END IF;
 IF TG_TABLE_NAME IN ('sail_participants','sail_interest') THEN
  SELECT v.owner_id INTO owner FROM sail_voyages v WHERE v.id=trip;
 ELSE owner:=(r->>'owner_id')::uuid; END IF;
 asset:=r->>'asset_id';
 IF asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assets a WHERE a.id=asset AND a.owner_id=owner) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF trip IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sail_voyages v JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.id=trip AND v.owner_id=owner) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF owner IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 record_key:=coalesce(r->>'id',r->>'voyage_id',r->>'asset_id');
 event_revision:=coalesce(r->>'revision',r->>'reviewed','1');
 label:=CASE TG_TABLE_NAME
  WHEN 'sail_voyages' THEN 'Trip plan saved'
  WHEN 'sail_participants' THEN CASE WHEN TG_OP='INSERT' THEN 'Person added to a trip' WHEN r->>'status'='accepted' AND (old_r->>'status' IS DISTINCT FROM r->>'status' OR old_r->>'accepted_revision' IS DISTINCT FROM r->>'accepted_revision') THEN 'Guest accepted or reconfirmed a plan' WHEN r->>'status'='declined' AND old_r->>'status' IS DISTINCT FROM r->>'status' THEN 'Guest declined a trip' WHEN r->>'status'='cancelled' THEN 'Invitation cancelled' ELSE 'Person or invitation updated' END
  WHEN 'sail_interest' THEN CASE WHEN TG_OP='INSERT' THEN 'New trip enquiry' ELSE 'Enquiry reviewed or prepared for invitation' END
  WHEN 'sail_media' THEN CASE WHEN TG_OP='DELETE' THEN 'Website photo removed' ELSE 'Website photo saved or publication changed' END
  WHEN 'sail_positions' THEN 'Position report saved'
  ELSE 'Crew or passenger availability updated' END;
 INSERT INTO sail_notifications(owner_id,voyage_id,event_key,summary)
 VALUES(owner,trip,TG_TABLE_NAME||':'||record_key||':'||event_revision||':'||TG_OP,label)
 ON CONFLICT(event_key) DO NOTHING;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$body$;
CREATE TRIGGER sail_voyages_notify AFTER INSERT OR UPDATE ON sail_voyages FOR EACH ROW EXECUTE FUNCTION sail_queue_notification();
CREATE TRIGGER sail_participants_notify AFTER INSERT OR UPDATE ON sail_participants FOR EACH ROW EXECUTE FUNCTION sail_queue_notification();
CREATE TRIGGER sail_interest_notify AFTER INSERT OR UPDATE ON sail_interest FOR EACH ROW EXECUTE FUNCTION sail_queue_notification();
CREATE TRIGGER sail_media_notify AFTER INSERT OR UPDATE OR DELETE ON sail_media FOR EACH ROW EXECUTE FUNCTION sail_queue_notification();
CREATE TRIGGER sail_positions_notify AFTER INSERT OR UPDATE ON sail_positions FOR EACH ROW EXECUTE FUNCTION sail_queue_notification();
CREATE TRIGGER sail_availability_notify AFTER INSERT OR UPDATE ON sail_availability FOR EACH ROW EXECUTE FUNCTION sail_queue_notification();
-- END UNCHANGED MIGRATION 031
INSERT INTO public.schema_migrations(name) VALUES('031_sail_timeline_notifications.sql');
COMMIT;
