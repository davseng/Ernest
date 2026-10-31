-- Additive Sail Far Better foundation. Apply manually after identity/schema review.
CREATE TABLE sail_voyages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id text NOT NULL REFERENCES assets(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 summary text NOT NULL DEFAULT '',
 departure_port text NOT NULL DEFAULT '',
 arrival_port text NOT NULL DEFAULT '',
 departure_from date,
 departure_to date,
 arrival_estimate date,
 timing_note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','ready','underway','completed','cancelled')),
 published boolean NOT NULL DEFAULT false,
 crew_expectations text NOT NULL DEFAULT '',
 passenger_expectations text NOT NULL DEFAULT '',
 boarding_notes text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(departure_to IS NULL OR (departure_from IS NOT NULL AND departure_to>=departure_from)),
 CHECK(arrival_estimate IS NULL OR departure_from IS NULL OR arrival_estimate>=departure_from)
);
CREATE INDEX sail_voyages_owner_idx ON sail_voyages(owner_id,asset_id,updated_at DESC);
CREATE INDEX sail_voyages_public_idx ON sail_voyages(published,departure_from);
CREATE TABLE sail_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 voyage_id uuid NOT NULL REFERENCES sail_voyages(id),
 full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 160),
 email text NOT NULL CHECK(length(email)<=254 AND email=lower(trim(email))),
 role text NOT NULL CHECK(role IN ('crew','passenger')),
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','declined','cancelled')),
 token_hash text UNIQUE,
 token_expires_at timestamptz,
 delivery_status text NOT NULL DEFAULT 'not_sent' CHECK(delivery_status IN ('not_sent','pending','sent','failed')),
 last_attempt_at timestamptz,
 last_sent_at timestamptz,
 accepted_revision integer,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(voyage_id,email)
);
CREATE TABLE sail_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 voyage_id uuid NOT NULL REFERENCES sail_voyages(id),
 revision integer NOT NULL,
 -- Private audit snapshots; never used as public or guest read models.
 before_record jsonb,
 after_record jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(voyage_id,revision)
);
CREATE TABLE sail_interest (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 voyage_id uuid NOT NULL REFERENCES sail_voyages(id),
 full_name text NOT NULL,
 email text NOT NULL,
 role text NOT NULL CHECK(role IN ('crew','passenger')),
 message text NOT NULL DEFAULT '',
 reviewed boolean NOT NULL DEFAULT false,
 requester_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sail_interest_owner_read_idx ON sail_interest(voyage_id,created_at DESC);
CREATE INDEX sail_interest_rate_idx ON sail_interest(requester_hash,created_at DESC);
