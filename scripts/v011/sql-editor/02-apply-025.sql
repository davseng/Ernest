-- RUN ONLY in Neon SQL Editor selected to ernest-v011-test / neondb.
-- First-install-only wrapper. Do not run on production or as a general migrator.
-- Review 01-preflight results first. Any error: ROLLBACK; stop and share the error.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('ernest-v011-025'));
DO $guard$
DECLARE issues text; object_name text; already_recorded boolean;
BEGIN
  IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database; stop'; END IF;
  SELECT string_agg(table_name||'.'||column_name||': expected '||expected_type, '; ')
  INTO issues FROM (
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
WHERE a.actual_type IS DISTINCT FROM r.expected_type
  ) AS problems;
  IF issues IS NOT NULL THEN RAISE EXCEPTION '025 prerequisite mismatch: %',issues; END IF;
  FOREACH object_name IN ARRAY ARRAY['owner_knowledge','procedure_revisions',
    'document_processing_status','document_visual_pages','document_page_embeddings',
    'owner_knowledge_asset_idx','owner_knowledge_current_idx',
    'document_pages_search_idx','documents_title_search_idx'] LOOP
    IF to_regclass('public.'||object_name) IS NOT NULL THEN
      RAISE EXCEPTION '025 object already exists: %. Stop for existing-schema review.',object_name;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='procedures' AND column_name='revision') THEN
    RAISE EXCEPTION 'procedures.revision already exists; stop for existing-schema review';
  END IF;
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.schema_migrations WHERE name=$1)'
      INTO already_recorded USING '025_competence_memory_action.sql';
    IF already_recorded THEN RAISE EXCEPTION '025 already recorded; inspect instead of replaying'; END IF;
  END IF;
END
$guard$;

-- BEGIN UNCHANGED MIGRATION 025
-- Additive only. Apply manually to an isolated Preview database after review.
CREATE TABLE IF NOT EXISTS owner_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 160),
  predicate text NOT NULL CHECK (length(predicate) BETWEEN 1 AND 160),
  value text NOT NULL CHECK (length(value) BETWEEN 1 AND 2000),
  kind text NOT NULL CHECK (kind IN ('current_fact','observation','equipment_status')),
  effective_on date NOT NULL,
  provenance text NOT NULL,
  verification text NOT NULL DEFAULT 'owner_confirmed' CHECK (verification='owner_confirmed'),
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  supersedes_id uuid REFERENCES owner_knowledge(id),
  superseded_by uuid REFERENCES owner_knowledge(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id IS DISTINCT FROM supersedes_id), CHECK (id IS DISTINCT FROM superseded_by)
);
CREATE INDEX IF NOT EXISTS owner_knowledge_asset_idx ON owner_knowledge(owner_id,asset_id,effective_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS owner_knowledge_current_idx
  ON owner_knowledge(owner_id,asset_id,lower(subject),lower(predicate))
  WHERE superseded_by IS NULL AND kind <> 'observation';
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS procedure_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(procedure_id,revision)
);
CREATE TABLE IF NOT EXISTS document_processing_status (
  document_id uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  stage text NOT NULL,
  visual_status text NOT NULL DEFAULT 'not_requested',
  error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS document_visual_pages (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number>0),
  interpretation text NOT NULL,
  model text NOT NULL,
  verification text NOT NULL DEFAULT 'unverified' CHECK(verification='unverified'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(document_id,page_number)
);
-- Page retrieval works even if an older chunk index is absent. Titles and identifiers use simple tokenization.
CREATE INDEX IF NOT EXISTS document_pages_search_idx ON document_pages USING gin(to_tsvector('english',text_content));
CREATE INDEX IF NOT EXISTS documents_title_search_idx ON documents USING gin(to_tsvector('simple',title || ' ' || original_filename));
ALTER TABLE document_processing_status ADD COLUMN IF NOT EXISTS semantic_status text NOT NULL DEFAULT 'not_requested';
CREATE TABLE IF NOT EXISTS document_page_embeddings (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  model text NOT NULL,
  embedding jsonb NOT NULL CHECK (jsonb_typeof(embedding)='array'),
  PRIMARY KEY(document_id,page_number),
  FOREIGN KEY(document_id,page_number) REFERENCES document_pages(document_id,page_number) ON DELETE CASCADE
);
-- END UNCHANGED MIGRATION 025

-- Record ONLY this migration; never fabricate a 022 entry.
CREATE TABLE IF NOT EXISTS public.schema_migrations(
  name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.schema_migrations(name) VALUES ('025_competence_memory_action.sql');
COMMIT;
