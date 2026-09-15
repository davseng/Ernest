CREATE TABLE IF NOT EXISTS boat_devices (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  secret_hash text NOT NULL UNIQUE,
  permissions text[] NOT NULL DEFAULT ARRAY['snapshot:read']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS boat_devices_asset_owner_idx
  ON boat_devices(asset_id, owner_id);

CREATE INDEX IF NOT EXISTS boat_devices_active_idx
  ON boat_devices(id)
  WHERE revoked_at IS NULL;
