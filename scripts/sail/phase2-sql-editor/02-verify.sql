-- READ ONLY: run after apply, separately on Preview and Production.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name;
SELECT name,applied_at FROM public.schema_migrations WHERE name='031_sail_timeline_notifications.sql';
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES ('sail_availability'),('sail_notifications')) AS objects(name);
SELECT event_object_table,trigger_name FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name LIKE '%_notify' GROUP BY event_object_table,trigger_name ORDER BY event_object_table;
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sail_availability','sail_notifications') ORDER BY table_name,ordinal_position;
SELECT state,count(*) FROM public.sail_notifications GROUP BY state;
COMMIT;
