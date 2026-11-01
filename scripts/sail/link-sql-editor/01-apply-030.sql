-- Owner-run, once in isolated Preview, then in the verified Production branch.
-- Take a Production Neon recovery checkpoint first. Run the ENTIRE transaction.
-- No data is deleted or rewritten. neondb alone cannot identify the Neon branch.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtext('sail-030'));
DO $guard$
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 IF to_regclass('public.schema_migrations') IS NULL OR to_regclass('public.sail_participants') IS NULL THEN RAISE EXCEPTION 'Verified Sail baseline required'; END IF;
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sail_participants' AND column_name='email') IS DISTINCT FROM 'text' THEN RAISE EXCEPTION 'Unexpected email column'; END IF;
 IF EXISTS(SELECT 1 FROM public.schema_migrations WHERE name='030_sail_optional_email.sql') THEN RAISE EXCEPTION 'Migration 030 already recorded; verify rather than replay'; END IF;
END
$guard$;
-- BEGIN UNCHANGED MIGRATION 030
-- Allow named guests without email; existing unique/check constraints remain.
-- PostgreSQL permits multiple NULL values in the voyage/email unique constraint.
ALTER TABLE sail_participants ALTER COLUMN email DROP NOT NULL;
-- END UNCHANGED MIGRATION 030
INSERT INTO public.schema_migrations(name) VALUES('030_sail_optional_email.sql');
COMMIT;
