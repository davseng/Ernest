-- PRODUCTION ONLY: owner selects the branch used by Vercel Production.
-- neondb alone does not identify the branch. Review 01-preflight first.
-- Create a fresh Neon recovery branch/checkpoint BEFORE running this script.
-- Run this entire transaction once. On error: ROLLBACK; stop and share the error.
-- No seeds, historical migrations, Preview rows, photos or tokens are copied.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('sail-production-027-029'));
DO $guard$
DECLARE object_name text;
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 FOREACH object_name IN ARRAY ARRAY['users','assets','owner_knowledge','procedure_revisions','document_processing_status','document_visual_pages','document_page_embeddings','update_reviews','maintenance_events','survey_items','update_audit','schema_migrations'] LOOP
  IF to_regclass('public.'||object_name) IS NULL THEN RAISE EXCEPTION 'Missing verified production baseline: %',object_name; END IF;
 END LOOP;
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='id') IS DISTINCT FROM 'text'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='owner_id') IS DISTINCT FROM 'uuid'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='name') IS DISTINCT FROM 'text'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id') IS DISTINCT FROM 'uuid' THEN
  RAISE EXCEPTION 'Unexpected identity schema';
 END IF;
 FOREACH object_name IN ARRAY ARRAY['sail_voyages','sail_participants','sail_changes','sail_interest','sail_media','sail_positions'] LOOP
  IF to_regclass('public.'||object_name) IS NOT NULL THEN RAISE EXCEPTION 'Sail schema already exists or is partial: %; stop for review',object_name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.schema_migrations WHERE name IN ('027_sail_far_better.sql','028_sail_photos.sql','029_sail_position.sql')) THEN
  RAISE EXCEPTION 'Sail migration ledger already contains a target migration; stop for review';
 END IF;
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
-- BEGIN UNCHANGED MIGRATION 028
-- Separate, explicitly published website photos. Existing Ernest evidence stays private.
CREATE TABLE sail_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id text NOT NULL REFERENCES assets(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 voyage_id uuid REFERENCES sail_voyages(id),
 category text NOT NULL CHECK(category IN ('exterior','sailing','forward_berth','aft_berth','salon','cockpit','galley','forward_lav')),
 caption text NOT NULL CHECK(length(caption) BETWEEN 1 AND 240),
 alt_text text NOT NULL CHECK(length(alt_text) BETWEEN 1 AND 500),
 upload_key text UNIQUE NOT NULL,
 storage_key text UNIQUE NOT NULL,
 ready boolean NOT NULL DEFAULT false,
 published boolean NOT NULL DEFAULT false,
 home_cover boolean NOT NULL DEFAULT false,
 voyage_cover boolean NOT NULL DEFAULT false,
 position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 width integer,
 height integer,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT published OR ready),
 CHECK(NOT home_cover OR (published AND voyage_id IS NULL)),
 CHECK(NOT voyage_cover OR (published AND voyage_id IS NOT NULL))
);
CREATE INDEX sail_media_owner_idx ON sail_media(owner_id,asset_id,position,created_at);
CREATE UNIQUE INDEX sail_media_home_cover_idx ON sail_media(asset_id) WHERE home_cover;
CREATE UNIQUE INDEX sail_media_voyage_cover_idx ON sail_media(voyage_id) WHERE voyage_cover;
-- END UNCHANGED MIGRATION 028
-- BEGIN UNCHANGED MIGRATION 029
-- One owner-approved last report per vessel; never read private operating logs.
CREATE TABLE sail_positions (
 asset_id text PRIMARY KEY REFERENCES assets(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 place_label text NOT NULL CHECK(length(place_label) BETWEEN 1 AND 160),
 reported_on date NOT NULL,
 latitude double precision CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision CHECK(longitude BETWEEN -180 AND 180),
 note text NOT NULL DEFAULT '',
 photo_id uuid REFERENCES sail_media(id) ON DELETE SET NULL,
 published boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((latitude IS NULL)=(longitude IS NULL))
);
-- END UNCHANGED MIGRATION 029
INSERT INTO public.schema_migrations(name) VALUES
 ('027_sail_far_better.sql'),('028_sail_photos.sql'),('029_sail_position.sql');
COMMIT;
