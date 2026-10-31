-- OWNER: isolated ernest-v011-test / neondb only. Never production.
-- Review preflight first and retain a checkpoint of this isolated branch.
-- Database name cannot prove Neon branch identity. Run the whole transaction once.
-- On error run ROLLBACK and stop. No seeds or old migrations.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('sail-029'));
DO $guard$
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 IF to_regclass('public.sail_positions') IS NOT NULL THEN RAISE EXCEPTION 'Position schema already exists or is partial; stop for review'; END IF;
 IF to_regclass('public.sail_voyages') IS NULL OR to_regclass('public.sail_media') IS NULL THEN RAISE EXCEPTION 'Verified Sail/photo baseline required'; END IF;
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='id') IS DISTINCT FROM 'text'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='owner_id') IS DISTINCT FROM 'uuid'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sail_media' AND column_name='id') IS DISTINCT FROM 'uuid'
 OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id') IS DISTINCT FROM 'uuid'
 THEN RAISE EXCEPTION 'Unexpected identity schema'; END IF;
END
$guard$;
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
CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.schema_migrations(name) VALUES('029_sail_position.sql');
COMMIT;
