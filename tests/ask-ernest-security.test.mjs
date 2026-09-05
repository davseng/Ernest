import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contextSource = await readFile(new URL("../src/data/document-context.ts", import.meta.url), "utf8");
const actionSource = await readFile(new URL("../src/app/assets/[id]/ask-actions.ts", import.meta.url), "utf8");
const answerSource = await readFile(new URL("../src/data/ask-ernest.ts", import.meta.url), "utf8");

test("Ask Ernest retrieval is owner scoped through documents and assets", () => {
  assert.match(contextSource, /INNER JOIN documents d ON d\.id = c\.document_id/);
  assert.match(contextSource, /INNER JOIN assets a ON a\.id = d\.asset_id/);
  assert.match(contextSource, /d\.asset_id = \$\{assetId\}/);
  assert.match(contextSource, /d\.owner_id = \$\{ownerId\}/);
  assert.match(contextSource, /a\.owner_id = \$\{ownerId\}/);
});

test("Ask Ernest expands matched chunks into neighboring source pages", () => {
  assert.match(contextSource, /p\.page_number BETWEEN GREATEST\(1, h\.page_number - 1\) AND h\.page_number \+ 1/);
  assert.match(contextSource, /LIMIT 16/);
});

test("Ask Ernest tolerates natural-language questions during retrieval", () => {
  assert.match(contextSource, /GENERIC_QUERY_WORDS/);
  assert.match(contextSource, /uniqueTerms\.join\(" OR "\)/);
  assert.match(contextSource, /websearch_to_tsquery\('english', \$\{retrievalQuery\}\)/);
});

test("Ask Ernest derives owner from authenticated session and grounds the model", () => {
  assert.match(actionSource, /getErnestDocumentContext\(assetId, session\.user\.id, question\)/);
  assert.doesNotMatch(actionSource, /ownerId.*formData/);
  assert.match(answerSource, /Answer only from the supplied source text/);
  assert.match(answerSource, /If the sources do not support a confident answer/);
});
