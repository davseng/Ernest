-- OWNER: select ernest-v011-test / neondb. This script is for isolated Preview only.
-- Run only after reviewing 01-preflight results. Do not change Production or DNS.
-- Keep a recovery branch of the isolated database. Run the complete transaction once.
-- On error: ROLLBACK; stop and report. No historical migrations or seeds.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('sail-027'));
DO $guard$
DECLARE object_name text;
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 FOREACH object_name IN ARRAY ARRAY['users','assets','update_reviews','maintenance_events'] LOOP
  IF to_regclass('public.'||object_name) IS NULL THEN RAISE EXCEPTION 'Missing verified baseline: %',object_name; END IF;
 END LOOP;
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='id') IS DISTINCT FROM 'text'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='owner_id') IS DISTINCT FROM 'uuid'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id') IS DISTINCT FROM 'uuid' THEN
  RAISE EXCEPTION 'Unexpected identity schema';
 END IF;
 FOREACH object_name IN ARRAY ARRAY['sail_voyages','sail_participants','sail_changes','sail_interest'] LOOP
  IF to_regclass('public.'||object_name) IS NOT NULL THEN RAISE EXCEPTION 'Sail schema already exists or is partial: %',object_name; END IF;
 END LOOP;
END
$guard$;
-- BEGIN UNCHANGED MIGRATION 027
-- Additive Sail Far Better foundation. Apply manually after identity/schema review.
CREATE TABLE sail_voyages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id text NOT NULL REFERENCES assets(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 summary text NOT NULL DEFAULT '',
 departure_port text NOT NULL DEFAULT '',
 arrival_port text NOT NULL DEFAULT '',
 departure_from date,
 departure_to date,
 arrival_estimate date,
 timing_note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','ready','underway','completed','cancelled')),
 published boolean NOT NULL DEFAULT false,
 crew_expectations text NOT NULL DEFAULT '',
 passenger_expectations text NOT NULL DEFAULT '',
 boarding_notes text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(departure_to IS NULL OR (departure_from IS NOT NULL AND departure_to>=departure_from)),
 CHECK(arrival_estimate IS NULL OR departure_from IS NULL OR arrival_estimate>=departure_from)
);
CREATE INDEX sail_voyages_owner_idx ON sail_voyages(owner_id,asset_id,updated_at DESC);
CREATE INDEX sail_voyages_public_idx ON sail_voyages(published,departure_from);
CREATE TABLE sail_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 voyage_id uuid NOT NULL REFERENCES sail_voyages(id),
 full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 160),
 email text NOT NULL CHECK(length(email)<=254 AND email=lower(trim(email))),
 role text NOT NULL CHECK(role IN ('crew','passenger')),
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','declined','cancelled')),
 token_hash text UNIQUE,
 token_expires_at timestamptz,
 delivery_status text NOT NULL DEFAULT 'not_sent' CHECK(delivery_status IN ('not_sent','pending','sent','failed')),
 last_attempt_at timestamptz,
 last_sent_at timestamptz,
 accepted_revision integer,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(voyage_id,email)
);
CREATE TABLE sail_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 voyage_id uuid NOT NULL REFERENCES sail_voyages(id),
 revision integer NOT NULL,
 -- Private audit snapshots; never used as public or guest read models.
 before_record jsonb,
 after_record jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(voyage_id,revision)
);
CREATE TABLE sail_interest (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 voyage_id uuid NOT NULL REFERENCES sail_voyages(id),
 full_name text NOT NULL,
 email text NOT NULL,
 role text NOT NULL CHECK(role IN ('crew','passenger')),
 message text NOT NULL DEFAULT '',
 reviewed boolean NOT NULL DEFAULT false,
 requester_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sail_interest_owner_read_idx ON sail_interest(voyage_id,created_at DESC);
CREATE INDEX sail_interest_rate_idx ON sail_interest(requester_hash,created_at DESC);
-- END UNCHANGED MIGRATION 027
CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.schema_migrations(name) VALUES('027_sail_far_better.sql');
COMMIT;
