-- READ ONLY. In Neon SQL Editor explicitly select branch ernest-v011-test,
-- database neondb. SQL cannot verify a Neon branch's human-readable name.
BEGIN READ ONLY;
SELECT current_database() AS database_name,current_schema() AS schema_name,
       current_setting('transaction_read_only') AS read_only;

-- Expected result: ZERO ROWS. Missing/wrongly typed prerequisites require review.
WITH required(table_name,column_name,expected_type) AS (
  VALUES ('assets','id','text'),
    ('users','id','uuid'),
    ('documents','id','uuid'),
    ('documents','title','text'),
    ('documents','original_filename','text'),
    ('document_pages','document_id','uuid'),
    ('document_pages','page_number','integer'),
    ('document_pages','text_content','text'),
    ('procedures','id','uuid')
), actual AS (
  SELECT c.relname AS table_name,a.attname AS column_name,
         pg_catalog.format_type(a.atttypid,a.atttypmod) AS actual_type
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND a.attnum>0 AND NOT a.attisdropped
)
SELECT r.table_name,r.column_name,r.expected_type,a.actual_type
FROM required r LEFT JOIN actual a USING(table_name,column_name)
WHERE a.actual_type IS DISTINCT FROM r.expected_type;

-- Check that FK targets have valid, immediate, single-column unique/primary keys.
-- Expected result: all four fk_target_ready values are true.
WITH targets(table_name,column_name) AS (VALUES ('assets','id'),('users','id'),('documents','id'),('procedures','id'))
SELECT t.*,EXISTS(
  SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid
  WHERE i.indrelid=to_regclass('public.'||t.table_name) AND a.attname=t.column_name
    AND i.indisunique AND i.indisvalid AND i.indimmediate
    AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1
    AND a.attnum=ANY(i.indkey::smallint[])
) AS fk_target_ready FROM targets t;

-- The composite page key must support the embedding FK. Expected: true.
SELECT EXISTS(
 SELECT 1 FROM pg_index i
 WHERE i.indrelid=to_regclass('public.document_pages') AND i.indisunique
   AND i.indisvalid AND i.indimmediate AND i.indpred IS NULL
   AND i.indexprs IS NULL AND i.indnkeyatts=2
   AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM pg_attribute a WHERE a.attrelid=i.indrelid
        AND a.attnum=ANY(i.indkey::smallint[]))=ARRAY['document_id','page_number']
) AS document_page_key_ready;

-- First-install path expects the five 025 tables and revision column absent.
-- boat_devices may remain absent and is not a 025 prerequisite.
SELECT name,to_regclass('public.'||name) AS existing_relation
FROM (VALUES ('boat_devices'),('owner_knowledge'),('procedure_revisions'),
 ('document_processing_status'),('document_visual_pages'),('document_page_embeddings'),
 ('schema_migrations')) AS objects(name);
SELECT column_name,data_type,column_default,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='procedures' AND column_name='revision';
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 AND indexname IN ('owner_knowledge_asset_idx','owner_knowledge_current_idx',
                  'document_pages_search_idx','documents_title_search_idx');

-- App compatibility inventory, separate from the direct DDL prerequisites.
-- Share missing items for review; do not blindly replay their migrations.
SELECT name,to_regclass('public.'||name) AS existing_relation
FROM (VALUES ('procedure_steps'),('document_chunks'),('document_findings'),
 ('external_connections'),('sessions'),('accounts'),('verification_token')) AS objects(name);
COMMIT;

-- ONLY IF schema_migrations exists, run this additional read-only query separately:
-- SELECT name FROM public.schema_migrations
-- WHERE name IN ('022_boat_devices.sql','025_competence_memory_action.sql') ORDER BY name;
