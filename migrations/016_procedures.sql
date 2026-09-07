CREATE TABLE IF NOT EXISTS procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  procedure_type text NOT NULL
    CHECK (procedure_type IN ('routine', 'checklist', 'emergency')),
  notes text,
  source_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  source_page integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS procedures_asset_idx
  ON procedures(owner_id, asset_id, procedure_type, lower(title));

CREATE TABLE IF NOT EXISTS procedure_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  position integer NOT NULL,
  instruction text NOT NULL,
  note text,
  UNIQUE (procedure_id, position)
);

CREATE INDEX IF NOT EXISTS procedure_steps_procedure_idx
  ON procedure_steps(procedure_id, position);

CREATE TABLE IF NOT EXISTS procedure_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  title text NOT NULL,
  procedure_type text NOT NULL
    CHECK (procedure_type IN ('routine', 'checklist', 'emergency')),
  notes text,
  steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  verified_procedure_id uuid REFERENCES procedures(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS procedure_candidates_asset_idx
  ON procedure_candidates(owner_id, asset_id, status, created_at);

CREATE INDEX IF NOT EXISTS procedure_candidates_document_idx
  ON procedure_candidates(owner_id, asset_id, document_id, page_number);
