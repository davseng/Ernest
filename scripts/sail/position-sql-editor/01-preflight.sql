-- READ ONLY. Select ernest-v011-test / neondb, not production.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name;
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES ('users'),('assets'),('sail_voyages'),('sail_media'),('sail_positions')) AS objects(name);
SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='assets' AND column_name IN ('id','owner_id')) OR (table_name='users' AND column_name='id') OR (table_name='sail_media' AND column_name IN ('id','asset_id','owner_id','published'))) ORDER BY table_name,column_name;
COMMIT;
