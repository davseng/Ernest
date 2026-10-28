-- OWNER: select ernest-v011-test / neondb in Neon SQL Editor.
-- This is NOT a production rollout. Database name alone does not identify a branch.
-- Retain a recovery checkpoint of the test branch before applying.
-- Run this entire transaction once. On error: ROLLBACK; stop and report.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('ernest-v012-026'));
DO $guard$
DECLARE object_name text;
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 IF to_regclass('public.owner_knowledge') IS NULL OR to_regclass('public.document_visual_pages') IS NULL THEN
  RAISE EXCEPTION 'Migration 025 schema is required; do not replay historical migrations';
 END IF;
 FOREACH object_name IN ARRAY ARRAY['assets','users','components','inventory_items','documents','conversation_messages'] LOOP
  IF to_regclass('public.'||object_name) IS NULL THEN RAISE EXCEPTION 'Missing prerequisite: %',object_name; END IF;
 END LOOP;
 FOREACH object_name IN ARRAY ARRAY['update_reviews','maintenance_events','survey_items','update_audit'] LOOP
  IF to_regclass('public.'||object_name) IS NOT NULL THEN RAISE EXCEPTION '026 object already exists: %. Stop for schema review.',object_name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='conversation_messages' AND column_name='review_id') THEN
  RAISE EXCEPTION 'review_id already exists; stop for schema review';
 END IF;
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='id') IS DISTINCT FROM 'text' THEN
  RAISE EXCEPTION 'Expected text asset IDs';
 END IF;
END
$guard$;
-- BEGIN UNCHANGED MIGRATION 026
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
-- END UNCHANGED MIGRATION 026
CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.schema_migrations(name) VALUES('026_simplified_review.sql');
COMMIT;
