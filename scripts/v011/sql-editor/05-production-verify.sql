-- READ ONLY. Owner-run production / neondb postflight after successful COMMIT.
BEGIN READ ONLY;
SELECT name,applied_at FROM public.schema_migrations
WHERE name IN ('022_boat_devices.sql','025_competence_memory_action.sql') ORDER BY name;
-- Expected: one 025 row. 022 must not have been added by this rollout.

SELECT name,to_regclass('public.'||name) AS existing_relation
FROM (VALUES ('boat_devices'),('owner_knowledge'),('procedure_revisions'),
 ('document_processing_status'),('document_visual_pages'),('document_page_embeddings')) AS objects(name);
-- All five 025 tables must be present. Preserve any pre-existing boat_devices state.

SELECT table_name,column_name,data_type,column_default,is_nullable
FROM information_schema.columns WHERE table_schema='public'
 AND (table_name IN ('owner_knowledge','procedure_revisions','document_processing_status',
                    'document_visual_pages','document_page_embeddings')
      OR (table_name='procedures' AND column_name='revision'))
ORDER BY table_name,ordinal_position;
-- procedures.revision: integer, default 1, NOT NULL.
-- document_processing_status.semantic_status: text, default 'not_requested', NOT NULL.

SELECT x.indexname,i.indisvalid,i.indisready,x.indexdef
FROM pg_indexes x JOIN pg_index i ON i.indexrelid=to_regclass('public.'||x.indexname)
WHERE x.schemaname='public' AND x.indexname IN ('owner_knowledge_asset_idx','owner_knowledge_current_idx',
                  'document_pages_search_idx','documents_title_search_idx') ORDER BY x.indexname;
-- Expected: four valid indexes, including the partial unique current-knowledge index.

SELECT c.conrelid::regclass AS table_name,c.conname,c.contype,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.connamespace='public'::regnamespace
 AND c.conrelid IN ('public.owner_knowledge'::regclass,'public.procedure_revisions'::regclass,
 'public.document_processing_status'::regclass,'public.document_visual_pages'::regclass,
 'public.document_page_embeddings'::regclass)
ORDER BY c.conrelid::regclass::text,c.conname;
-- Confirm text asset FKs, uuid owner/document/procedure FKs, and embedding page FK.
COMMIT;
