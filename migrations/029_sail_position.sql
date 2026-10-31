-- One owner-approved last report per vessel; never read private operating logs.
CREATE TABLE sail_positions (
 asset_id text PRIMARY KEY REFERENCES assets(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 place_label text NOT NULL CHECK(length(place_label) BETWEEN 1 AND 160),
 reported_on date NOT NULL,
 latitude double precision CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision CHECK(longitude BETWEEN -180 AND 180),
 note text NOT NULL DEFAULT '',
 photo_id uuid REFERENCES sail_media(id) ON DELETE SET NULL,
 published boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((latitude IS NULL)=(longitude IS NULL))
);
