import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile("src/data/postgres-asset-repository.ts", "utf8");
const actions = await readFile("src/app/assets/[id]/inventory-actions.ts", "utf8");

test("component creation constrains system, asset, and owner", () => {
  assert.match(repository, /INSERT INTO components[\s\S]*FROM systems s[\s\S]*INNER JOIN assets a ON a\.id = s\.asset_id[\s\S]*s\.id = \$\{systemId\}[\s\S]*a\.id = \$\{assetId\}[\s\S]*a\.owner_id = \$\{ownerId\}[\s\S]*RETURNING id/);
  assert.match(actions, /createComponent\(assetId, systemId, ownerId, parseComponentDetails\(formData\)\)/);
});

test("component update constrains component, system, asset, and owner", () => {
  assert.match(repository, /UPDATE components c[\s\S]*c\.id = \$\{componentId\}[\s\S]*c\.system_id = \$\{systemId\}[\s\S]*a\.id = \$\{assetId\}[\s\S]*a\.owner_id = \$\{ownerId\}[\s\S]*RETURNING c\.id/);
  assert.match(actions, /updateComponent\(assetId, systemId, componentId, ownerId, parseComponentDetails\(formData\)\)/);
});

test("component deletion constrains component, system, asset, and owner", () => {
  assert.match(repository, /DELETE FROM components c USING systems s, assets a[\s\S]*c\.id = \$\{componentId\}[\s\S]*c\.system_id = \$\{systemId\}[\s\S]*a\.id = \$\{assetId\}[\s\S]*a\.owner_id = \$\{ownerId\}[\s\S]*RETURNING c\.id/);
  assert.match(actions, /deleteComponent\(assetId, systemId, componentId, await owner\(\)\)/);
});

test("component actions derive ownership from the authenticated session", () => {
  assert.match(actions, /const session = await auth\(\)/);
  assert.match(actions, /return session\.user\.id/);
  assert.doesNotMatch(actions, /formData\.get\(["'](?:owner|ownerId|assetId|systemId|componentId)["']\)/);
  assert.match(actions, /if \(!created\) notFound\(\)/);
  assert.match(actions, /if \(!updated\) notFound\(\)/);
});
