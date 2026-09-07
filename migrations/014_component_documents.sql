CREATE TABLE IF NOT EXISTS component_documents (
  component_id text NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'manual'
    CHECK (relationship IN ('manual', 'service', 'reference', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (component_id, document_id)
);

CREATE INDEX IF NOT EXISTS component_documents_asset_idx
  ON component_documents(owner_id, asset_id, component_id);

CREATE INDEX IF NOT EXISTS component_documents_document_idx
  ON component_documents(owner_id, asset_id, document_id);
