-- OWNER: select ernest-v011-test / neondb. ISOLATED PREVIEW ONLY.
-- Review preflight first. Database name cannot prove Neon branch identity.
-- Keep a checkpoint of the isolated branch. Run this whole transaction once.
-- On error: ROLLBACK; stop and report. No seeds or historical migrations.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('sail-028'));
DO $guard$
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 IF to_regclass('public.sail_media') IS NOT NULL THEN RAISE EXCEPTION 'Photo schema already exists or is partial; stop for review'; END IF;
 IF to_regclass('public.sail_voyages') IS NULL OR to_regclass('public.sail_participants') IS NULL THEN RAISE EXCEPTION 'Verified Sail migration 027 baseline required'; END IF;
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='id') IS DISTINCT FROM 'text'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='owner_id') IS DISTINCT FROM 'uuid'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id') IS DISTINCT FROM 'uuid'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sail_voyages' AND column_name='id') IS DISTINCT FROM 'uuid'
 THEN RAISE EXCEPTION 'Unexpected identity schema'; END IF;
END
$guard$;
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
CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.schema_migrations(name) VALUES('028_sail_photos.sql');
COMMIT;
