-- Separate, explicitly published website photos. Existing Ernest evidence stays private.
CREATE TABLE sail_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id text NOT NULL REFERENCES assets(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 voyage_id uuid REFERENCES sail_voyages(id),
 category text NOT NULL CHECK(category IN ('exterior','sailing','forward_berth','aft_berth','salon','cockpit','galley','forward_lav')),
 caption text NOT NULL CHECK(length(caption) BETWEEN 1 AND 240),
 alt_text text NOT NULL CHECK(length(alt_text) BETWEEN 1 AND 500),
 upload_key text UNIQUE NOT NULL,
 storage_key text UNIQUE NOT NULL,
 ready boolean NOT NULL DEFAULT false,
 published boolean NOT NULL DEFAULT false,
 home_cover boolean NOT NULL DEFAULT false,
 voyage_cover boolean NOT NULL DEFAULT false,
 position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 width integer,
 height integer,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT published OR ready),
 CHECK(NOT home_cover OR (published AND voyage_id IS NULL)),
 CHECK(NOT voyage_cover OR (published AND voyage_id IS NOT NULL))
);
CREATE INDEX sail_media_owner_idx ON sail_media(owner_id,asset_id,position,created_at);
CREATE UNIQUE INDEX sail_media_home_cover_idx ON sail_media(asset_id) WHERE home_cover;
CREATE UNIQUE INDEX sail_media_voyage_cover_idx ON sail_media(voyage_id) WHERE voyage_cover;
