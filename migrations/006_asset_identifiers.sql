ALTER TABLE assets ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE components ADD COLUMN IF NOT EXISTS serial_number text;
