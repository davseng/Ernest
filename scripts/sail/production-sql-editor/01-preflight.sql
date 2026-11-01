-- READ ONLY: select the existing PRODUCTION Neon branch explicitly.
-- neondb alone cannot distinguish production from Preview.
-- Do not apply any migration until this output has been reviewed.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name;
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES
 ('users'),('assets'),('owner_knowledge'),('procedure_revisions'),('document_processing_status'),('document_visual_pages'),('document_page_embeddings'),('update_reviews'),('maintenance_events'),('survey_items'),('update_audit'),
 ('sail_voyages'),('sail_participants'),('sail_changes'),('sail_interest'),('sail_media'),('sail_positions')) AS objects(name);
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND ((table_name='assets' AND column_name IN ('id','owner_id','name')) OR (table_name='users' AND column_name='id')) ORDER BY table_name,column_name;
SELECT to_regclass('public.schema_migrations') AS migration_ledger;
COMMIT;
