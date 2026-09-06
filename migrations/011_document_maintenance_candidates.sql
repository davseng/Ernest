CREATE TABLE IF NOT EXISTS document_maintenance_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  occurred_on date,
  engine_hours numeric,
  action text NOT NULL,
  parts_consumables text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS document_maintenance_candidates_review_idx
  ON document_maintenance_candidates(owner_id, asset_id, document_id, status, page_number);
