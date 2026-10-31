-- READ ONLY. Same isolated ernest-v011-test / neondb branch after COMMIT.
BEGIN READ ONLY;
SELECT name,applied_at FROM public.schema_migrations WHERE name='029_sail_position.sql';
SELECT to_regclass('public.sail_positions') AS relation;
SELECT count(*) AS position_count FROM sail_positions;
SELECT column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='sail_positions' ORDER BY ordinal_position;
COMMIT;
