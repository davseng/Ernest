-- Ernest v0.8: private photo evidence foundation.
-- Additive/idempotent. Do not seed.

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  component_id text REFERENCES components(id) ON DELETE SET NULL,
  title text NOT NULL,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL UNIQUE,
  notes text,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photos_owner_asset_created_idx
  ON photos (owner_id, asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS photos_component_idx
  ON photos (component_id)
  WHERE component_id IS NOT NULL;
