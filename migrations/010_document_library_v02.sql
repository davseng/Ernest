ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_source_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_source_type_check
  CHECK (source_type IN ('upload', 'url'));

CREATE INDEX IF NOT EXISTS documents_owner_source_url_idx
  ON documents(owner_id, source_url)
  WHERE source_url IS NOT NULL;
