ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_source_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_source_type_check
  CHECK (source_type IN ('upload', 'url', 'google_drive'));

CREATE UNIQUE INDEX IF NOT EXISTS documents_owner_source_external_id_idx
  ON documents(owner_id, source_type, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_owner_content_hash_idx
  ON documents(owner_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer,
  subject_component_id text REFERENCES components(id) ON DELETE SET NULL,
  finding_type text NOT NULL,
  statement text NOT NULL,
  observed_at date,
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('unknown', 'current', 'resolved', 'superseded')),
  confidence numeric(4,3),
  resolved_by uuid REFERENCES document_findings(id) ON DELETE SET NULL,
  superseded_by uuid REFERENCES document_findings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_findings_asset_status_idx
  ON document_findings(asset_id, owner_id, status);

CREATE INDEX IF NOT EXISTS document_findings_document_idx
  ON document_findings(document_id);
