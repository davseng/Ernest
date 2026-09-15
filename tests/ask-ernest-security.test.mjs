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
  assert.match(contextSource, /LIMIT 20/);
});

test("Ask Ernest tolerates natural-language questions during retrieval", () => {
  assert.match(contextSource, /GENERIC_QUERY_WORDS/);
  assert.match(contextSource, /uniqueTerms\.join\(" OR "\)/);
  assert.match(contextSource, /websearch_to_tsquery\('english', \$\{retrievalQuery\}\)/);
  assert.match(contextSource, /CROSS JOIN query q/);
});

test("Ask Ernest derives owner from authenticated session and preserves grounded competence", () => {
  assert.match(actionSource, /getErnestDocumentContext\(assetId,\s*session\.user\.id,\s*question\)/);
  assert.doesNotMatch(actionSource, /ownerId.*formData/);
  assert.match(answerSource, /Never turn general knowledge, inference, ambiguous text, or conversation into a verified fact about this asset/);
  assert.match(answerSource, /still give useful general domain expertise/);
  assert.match(answerSource, /Never claim an action was completed unless the application explicitly confirms it was completed/);
});
