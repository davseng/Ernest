import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repository = fs.readFileSync("src/data/documents.ts", "utf8");
const actions = fs.readFileSync("src/app/assets/[id]/document-actions.ts", "utf8");

test("document reads are constrained to the authenticated owner and owned asset", () => {
  assert.match(repository, /d\.owner_id = \$?\{?ownerId\}?/);
  assert.match(repository, /a\.owner_id = \$?\{?ownerId\}?/);
});

test("document inserts derive owner from the owned asset", () => {
  assert.match(repository, /SELECT a\.id, a\.owner_id/);
  assert.match(repository, /a\.owner_id = \$?\{?ownerId\}?/);
});

test("upload action derives owner identity from the authenticated session", () => {
  assert.match(actions, /session\.user\.id/);
  assert.doesNotMatch(actions, /formData\.get\(["']owner/i);
});
