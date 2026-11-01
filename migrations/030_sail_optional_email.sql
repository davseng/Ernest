-- Allow named guests without email; existing unique/check constraints remain.
-- PostgreSQL permits multiple NULL values in the voyage/email unique constraint.
ALTER TABLE sail_participants ALTER COLUMN email DROP NOT NULL;
