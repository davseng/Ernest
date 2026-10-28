-- Read only. Explicitly select ernest-v011-test / neondb, not production.
BEGIN READ ONLY;
SELECT current_database() AS database_name;
SELECT name,to_regclass('public.'||name) AS relation
FROM (VALUES ('assets'),('users'),('components'),('inventory_items'),('documents'),
 ('conversation_messages'),('owner_knowledge'),('document_visual_pages'),
 ('update_reviews'),('maintenance_events'),('survey_items'),('update_audit')) AS objects(name);
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND ((table_name IN ('assets','users','components','inventory_items','documents') AND column_name='id') OR (table_name='conversation_messages' AND column_name='review_id')) ORDER BY table_name,column_name;
COMMIT;
