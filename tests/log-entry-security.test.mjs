import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile("src/data/postgres-log-entry-repository.ts", "utf8");
const action = await readFile("src/app/assets/[id]/actions.ts", "utf8");

test("log reads are constrained by asset and owner", () => {
  assert.match(repository, /WHERE le\.asset_id = \$\{assetId\} AND a\.owner_id = \$\{ownerId\}/);
  assert.match(repository, /ORDER BY le\.occurred_at DESC, le\.created_at DESC/);
});

test("creation selects only an asset belonging to the authenticated owner", () => {
  assert.match(repository, /FROM assets a WHERE a\.id = \$\{assetId\} AND a\.owner_id = \$\{ownerId\}/);
  assert.match(repository, /SELECT a\.id, \$\{ownerId\}/);
});

test("manual author and source are assigned outside browser input", () => {
  assert.match(action, /createLogEntry\(assetId, session\.user\.id/);
  assert.doesNotMatch(action, /formData\.get\(["'](?:author|source|assetId)["']\)/);
  assert.match(repository, /'manual'/);
});
