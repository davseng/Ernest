-- READ ONLY diagnostic. Select the same Production branch used for the rollout.
-- If the previous SQL left an aborted transaction, run ROLLBACK separately first.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name;
SELECT name,applied_at FROM public.schema_migrations
WHERE name LIKE '027%' OR name LIKE '028%' OR name LIKE '029%' ORDER BY name;
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES
 ('sail_voyages'),('sail_participants'),('sail_changes'),('sail_interest'),('sail_media'),('sail_positions')) AS objects(name);
SELECT table_name,column_name,data_type,column_default,is_nullable
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('sail_voyages','sail_participants','sail_changes','sail_interest','sail_media','sail_positions')
ORDER BY table_name,ordinal_position;
SELECT t.relname AS table_name,c.conname AS constraint_name,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN ('sail_voyages','sail_participants','sail_changes','sail_interest','sail_media','sail_positions')
ORDER BY t.relname,c.conname;
COMMIT;
