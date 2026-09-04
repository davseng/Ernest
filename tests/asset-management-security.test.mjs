import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile("src/data/postgres-asset-repository.ts", "utf8");
const assetActions = await readFile("src/app/assets/actions.ts", "utf8");
const inventoryActions = await readFile("src/app/assets/[id]/inventory-actions.ts", "utf8");

test("every asset mutation is constrained by the authenticated owner", () => {
  assert.match(repository, /WHERE id=\$\{id\} AND owner_id=\$\{ownerId\}/);
  assert.match(repository, /DELETE FROM assets WHERE id=\$\{id\} AND owner_id=\$\{ownerId\}/);
  assert.match(assetActions, /createAsset\(session\.user\.id/);
  assert.doesNotMatch(assetActions, /formData\.get\(["']owner/);
});

test("system mutations traverse the asset ownership boundary", () => {
  assert.match(repository, /FROM assets a WHERE a\.id=\$\{assetId\} AND a\.owner_id=\$\{ownerId\}/);
  assert.match(repository, /a\.owner_id=\$\{ownerId\} RETURNING s\.id/g);
  assert.match(inventoryActions, /const ownerId = await owner\(\)/);
});

test("component mutations constrain component, system, asset, and owner", () => {
  assert.match(repository, /c\.id=\$\{componentId\} AND c\.system_id=\$\{systemId\}/);
  assert.match(repository, /a\.id=\$\{assetId\} AND a\.owner_id=\$\{ownerId\}/);
  assert.doesNotMatch(inventoryActions, /formData\.get\(["'](?:ownerId|assetId|systemId|componentId)["']\)/);
});
