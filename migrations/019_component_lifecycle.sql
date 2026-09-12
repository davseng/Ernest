ALTER TABLE components
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'installed',
  ADD COLUMN IF NOT EXISTS lifecycle_changed_on date,
  ADD COLUMN IF NOT EXISTS lifecycle_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'components_lifecycle_status_check'
  ) THEN
    ALTER TABLE components
      ADD CONSTRAINT components_lifecycle_status_check
      CHECK (lifecycle_status IN ('installed', 'removed_replaced', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS components_lifecycle_status_idx
  ON components (lifecycle_status);
