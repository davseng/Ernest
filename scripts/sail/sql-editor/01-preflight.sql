-- READ ONLY. Select ernest-v011-test / neondb in Neon SQL Editor, not production.
-- The database name does not prove which Neon branch is selected.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name;
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES
 ('users'),('assets'),('update_reviews'),('maintenance_events'),
 ('sail_voyages'),('sail_participants'),('sail_changes'),('sail_interest')) AS objects(name);
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND ((table_name='assets' AND column_name IN ('id','owner_id','name')) OR (table_name='users' AND column_name='id')) ORDER BY table_name,column_name;
COMMIT;
