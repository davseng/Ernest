CREATE TABLE assets (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('Boat', 'RV')),
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1800 AND 3000),
  summary text NOT NULL
);

CREATE TABLE systems (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  UNIQUE (asset_id, id)
);

CREATE INDEX systems_asset_id_idx ON systems(asset_id);

CREATE TABLE components (
  id text PRIMARY KEY,
  system_id text NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  manufacturer text NOT NULL,
  model text NOT NULL,
  location text NOT NULL,
  notes text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  UNIQUE (system_id, id)
);

CREATE INDEX components_system_id_idx ON components(system_id);
