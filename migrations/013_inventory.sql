CREATE TABLE IF NOT EXISTS inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, asset_id, code)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  details text,
  source_label text,
  source_page integer,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_source_key_idx
  ON inventory_items(owner_id, asset_id, source_key)
  WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_items_lookup_idx
  ON inventory_items(owner_id, asset_id, lower(name));

CREATE TABLE IF NOT EXISTS inventory_item_locations (
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, location_id)
);

CREATE INDEX IF NOT EXISTS inventory_item_locations_location_idx
  ON inventory_item_locations(location_id, item_id);
