CREATE TABLE IF NOT EXISTS equipment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  name text NOT NULL,
  manufacturer text,
  model text,
  serial_number text,
  location text,
  system_hint text,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  verified_component_id text REFERENCES components(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS equipment_candidates_asset_idx
  ON equipment_candidates(owner_id, asset_id, status, created_at);

CREATE INDEX IF NOT EXISTS equipment_candidates_document_idx
  ON equipment_candidates(owner_id, asset_id, document_id, page_number);
