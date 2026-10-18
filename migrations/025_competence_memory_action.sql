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
