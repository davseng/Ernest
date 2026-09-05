import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documentsSource = await readFile(new URL("../src/data/documents.ts", import.meta.url), "utf8");
const assetPageSource = await readFile(new URL("../src/app/assets/[id]/page.tsx", import.meta.url), "utf8");

test("document search is scoped through owned documents and assets", () => {
  assert.match(documentsSource, /FROM document_chunks c/);
  assert.match(documentsSource, /INNER JOIN documents d ON d\.id = c\.document_id/);
  assert.match(documentsSource, /INNER JOIN assets a ON a\.id = d\.asset_id/);
  assert.match(documentsSource, /d\.asset_id = \$\{assetId\}/);
  assert.match(documentsSource, /d\.owner_id = \$\{ownerId\}/);
  assert.match(documentsSource, /a\.owner_id = \$\{ownerId\}/);
});

test("asset page derives document search owner from authenticated session", () => {
  assert.match(assetPageSource, /if \(!session\?\.user\?\.id\) redirect\("\/sign-in"\)/);
  assert.match(assetPageSource, /searchDocumentChunks\(id, session\.user\.id, normalizedDocumentQuery\)/);
  assert.doesNotMatch(assetPageSource, /ownerId.*searchParams/);
});

test("search results preserve document and page provenance", () => {
  assert.match(documentsSource, /d\.title AS document_title/);
  assert.match(documentsSource, /c\.page_number/);
  assert.match(documentsSource, /chunkIndex: row\.chunk_index/);
});
