-- Repair environments where the identifier feature was deployed before its
-- schema migration was applied (or where migration history drifted). Keeping
-- this idempotent makes it safe for databases that already have both columns.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE components ADD COLUMN IF NOT EXISTS serial_number text;
