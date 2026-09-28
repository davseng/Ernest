CREATE TABLE IF NOT EXISTS external_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_drive')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  provider_account_email text,
  folder_id text,
  folder_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, provider)
);

CREATE INDEX IF NOT EXISTS external_connections_owner_provider_idx
  ON external_connections(owner_id, provider);
