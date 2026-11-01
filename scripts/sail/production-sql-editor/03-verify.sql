-- READ ONLY: same verified PRODUCTION Neon branch, neondb / public.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name;
SELECT name,applied_at FROM public.schema_migrations WHERE name IN ('027_sail_far_better.sql','028_sail_photos.sql','029_sail_position.sql') ORDER BY name;
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES ('sail_voyages'),('sail_participants'),('sail_changes'),('sail_interest'),('sail_media'),('sail_positions')) AS objects(name);
SELECT 'sail_voyages' AS table_name,count(*) AS row_count FROM public.sail_voyages
UNION ALL SELECT 'sail_participants',count(*) FROM public.sail_participants
UNION ALL SELECT 'sail_changes',count(*) FROM public.sail_changes
UNION ALL SELECT 'sail_interest',count(*) FROM public.sail_interest
UNION ALL SELECT 'sail_media',count(*) FROM public.sail_media
UNION ALL SELECT 'sail_positions',count(*) FROM public.sail_positions;
SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sail_voyages','sail_participants','sail_changes','sail_interest','sail_media','sail_positions') ORDER BY table_name,ordinal_position;
COMMIT;
