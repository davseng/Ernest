-- READ ONLY. Same isolated ernest-v011-test / neondb branch after COMMIT.
BEGIN READ ONLY;
SELECT name,applied_at FROM public.schema_migrations WHERE name='027_sail_far_better.sql';
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES ('sail_voyages'),('sail_participants'),('sail_changes'),('sail_interest')) AS objects(name);
SELECT 'sail_voyages' AS table_name,count(*) FROM sail_voyages UNION ALL SELECT 'sail_participants',count(*) FROM sail_participants UNION ALL SELECT 'sail_changes',count(*) FROM sail_changes UNION ALL SELECT 'sail_interest',count(*) FROM sail_interest;
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND ((table_name='sail_voyages' AND column_name IN ('departure_from','departure_to','arrival_estimate','published','revision')) OR (table_name='sail_participants' AND column_name IN ('token_hash','token_expires_at','accepted_revision'))) ORDER BY table_name,column_name;
COMMIT;
