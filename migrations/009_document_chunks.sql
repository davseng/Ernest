CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  text_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, page_number, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_document_idx
  ON document_chunks(document_id, page_number, chunk_index);

CREATE INDEX IF NOT EXISTS document_chunks_text_search_idx
  ON document_chunks USING gin (to_tsvector('english', text_content));
