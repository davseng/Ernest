import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("migrations/009_document_chunks.sql", "utf8");
const repository = fs.readFileSync("src/data/documents.ts", "utf8");
const chunker = fs.readFileSync("src/data/document-chunks.ts", "utf8");

test("document chunks preserve document, page, and chunk provenance", () => {
  assert.match(migration, /document_id uuid NOT NULL REFERENCES documents\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /page_number integer NOT NULL/i);
  assert.match(migration, /chunk_index integer NOT NULL/i);
  assert.match(migration, /UNIQUE \(document_id, page_number, chunk_index\)/i);
});

test("re-extraction regenerates chunks and pages together", () => {
  assert.match(repository, /DELETE FROM document_chunks WHERE document_id = \$\{documentId\}/);
  assert.match(repository, /DELETE FROM document_pages WHERE document_id = \$\{documentId\}/);
  assert.match(repository, /INSERT INTO document_chunks \(document_id, page_number, chunk_index, text_content\)/);
});

test("chunking is page-aware and overlapping", () => {
  assert.match(chunker, /pageNumber: page\.pageNumber/);
  assert.match(chunker, /OVERLAP_CHARS = 200/);
  assert.match(chunker, /TARGET_CHARS = 1200/);
});
