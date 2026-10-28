-- Read only, same isolated Neon branch after COMMIT.
BEGIN READ ONLY;
SELECT name,applied_at FROM public.schema_migrations WHERE name IN ('025_competence_memory_action.sql','026_simplified_review.sql') ORDER BY name;
SELECT name,to_regclass('public.'||name) AS relation FROM (VALUES ('update_reviews'),('maintenance_events'),('survey_items'),('update_audit')) AS objects(name);
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND ((table_name='conversation_messages' AND column_name='review_id') OR (table_name='maintenance_events' AND column_name IN ('occurred_on','engine_hours','revision'))) ORDER BY table_name,column_name;
SELECT 'update_reviews' AS table_name,count(*) FROM update_reviews UNION ALL SELECT 'maintenance_events',count(*) FROM maintenance_events UNION ALL SELECT 'survey_items',count(*) FROM survey_items UNION ALL SELECT 'update_audit',count(*) FROM update_audit;
COMMIT;
