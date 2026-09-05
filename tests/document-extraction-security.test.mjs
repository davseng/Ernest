import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repository = fs.readFileSync("src/data/documents.ts", "utf8");
const route = fs.readFileSync("src/app/assets/[id]/documents/[documentId]/extract/route.ts", "utf8");
const migration = fs.readFileSync("migrations/008_document_text_extraction.sql", "utf8");

test("extraction lookup is constrained to authenticated owner and asset", () => {
  assert.match(repository, /d\.id = \$?\{?documentId\}?/);
  assert.match(repository, /d\.asset_id = \$?\{?assetId\}?/);
  assert.match(repository, /d\.owner_id = \$?\{?ownerId\}?/);
  assert.match(repository, /a\.owner_id = \$?\{?ownerId\}?/);
});

test("extraction route derives owner identity from the authenticated session", () => {
  assert.match(route, /session\.user\.id/);
  assert.doesNotMatch(route, /ownerId\s*[:=]\s*(?:request|params)/i);
});

test("document pages preserve document and page provenance", () => {
  assert.match(migration, /document_id uuid NOT NULL REFERENCES documents\(id\)/);
  assert.match(migration, /page_number integer NOT NULL/);
  assert.match(migration, /UNIQUE \(document_id, page_number\)/);
});

test("page replacement records page number and extracted text", () => {
  assert.match(repository, /INSERT INTO document_pages \(document_id, page_number, text_content\)/);
  assert.match(repository, /page\.pageNumber/);
  assert.match(repository, /page\.text/);
});
