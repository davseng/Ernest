ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS maintenance_guidance text;

ALTER TABLE document_maintenance_candidates
  ADD COLUMN IF NOT EXISTS date_text text;
