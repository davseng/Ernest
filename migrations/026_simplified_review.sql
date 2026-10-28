-- Additive. Owner-run only after target identity/schema review; never from build.
CREATE TABLE update_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request text NOT NULL,
 draft jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','saved','cancelled')),
 receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 saved_at timestamptz
);
ALTER TABLE conversation_messages ADD COLUMN review_id uuid REFERENCES update_reviews(id);
CREATE INDEX update_reviews_owner_idx ON update_reviews(owner_id,asset_id,created_at DESC);
CREATE TABLE maintenance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 occurred_on date,
 title text NOT NULL,
 description text NOT NULL,
 component_id text REFERENCES components(id) ON DELETE SET NULL,
 engine_hours numeric CHECK(engine_hours>=0),
 spare_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
 spare_used numeric CHECK(spare_used>0),
 evidence jsonb NOT NULL DEFAULT '[]',
 request_fingerprint text NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_events_owner_idx ON maintenance_events(owner_id,asset_id,occurred_on DESC);
CREATE TABLE survey_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES documents(id),
 identifier text NOT NULL,
 priority text NOT NULL CHECK(priority IN ('A','B')),
 wording text NOT NULL,
 page_number integer NOT NULL CHECK(page_number>0),
 status text NOT NULL CHECK(status IN ('open','repair_documented','partially_addressed','owner_confirmed_resolved','no_subsequent_evidence','needs_review')),
 notes text NOT NULL DEFAULT '',
 evidence jsonb NOT NULL DEFAULT '[]',
 revision integer NOT NULL DEFAULT 1,
 approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,asset_id,document_id,identifier)
);
CREATE TABLE update_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL REFERENCES update_reviews(id),
 asset_id text NOT NULL REFERENCES assets(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 changes jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX update_audit_owner_idx ON update_audit(owner_id,asset_id,created_at DESC);
