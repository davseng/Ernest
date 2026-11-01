-- READ ONLY: run in each branch after applying 030.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name;
SELECT name,applied_at FROM public.schema_migrations WHERE name='030_sail_optional_email.sql';
SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='sail_participants' AND column_name='email';
COMMIT;
