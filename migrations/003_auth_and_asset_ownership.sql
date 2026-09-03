CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text UNIQUE,
  "emailVerified" timestamptz,
  image text
);

CREATE TABLE accounts (
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  provider text NOT NULL,
  "providerAccountId" text NOT NULL,
  refresh_token text,
  access_token text,
  expires_at bigint,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  PRIMARY KEY (provider, "providerAccountId")
);

CREATE TABLE sessions (
  "sessionToken" text PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires timestamptz NOT NULL
);

CREATE TABLE verification_token (
  identifier text NOT NULL,
  token text NOT NULL,
  expires timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Give rows created by the original seed a valid owner during the migration.
-- db:seed replaces this non-deliverable address with SEED_OWNER_EMAIL.
INSERT INTO users (id, name, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'Far Better owner', 'far-better@seed.ernest.invalid');

ALTER TABLE assets ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
UPDATE assets SET owner_id = '00000000-0000-0000-0000-000000000001' WHERE owner_id IS NULL;
ALTER TABLE assets ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX assets_owner_id_idx ON assets(owner_id);
