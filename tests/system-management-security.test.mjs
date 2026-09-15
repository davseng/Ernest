import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile("src/data/postgres-asset-repository.ts", "utf8");
const repositoryPort = await readFile("src/data/asset-repository.ts", "utf8");
const actions = await readFile("src/app/assets/[id]/inventory-actions.ts", "utf8");

test("system creation selects its asset through the authenticated owner", () => {
  assert.match(repository, /INSERT INTO systems[\s\S]*FROM assets a[\s\S]*a\.id = \$\{assetId\} AND a\.owner_id = \$\{ownerId\}/);
  assert.match(actions, /createSystem\(assetId, ownerId, parseSystemDetails\(formData\)\)/);
});

test("system update constrains system, parent asset, and owner", () => {
  assert.match(repository, /UPDATE systems s[\s\S]*s\.id = \$\{systemId\} AND s\.asset_id = \$\{assetId\}[\s\S]*a\.owner_id = \$\{ownerId\}/);
  assert.match(actions, /updateSystem\(assetId, systemId, ownerId, parseSystemDetails\(formData\)\)/);
});

test("system deletion constrains system, parent asset, and owner", () => {
  assert.match(repository, /DELETE FROM systems s USING assets a[\s\S]*s\.id = \$\{systemId\} AND s\.asset_id = \$\{assetId\}[\s\S]*a\.owner_id = \$\{ownerId\}/);
  assert.match(actions, /deleteSystem\(assetId, systemId, await owner\(\)\)/);
});

test("system actions derive ownership from the session", () => {
  assert.match(actions, /const session = await auth\(\)/);
  assert.match(actions, /return session\.user\.id/);
  assert.doesNotMatch(actions, /formData\.get\(["']owner/);
  assert.match(actions, /if \(!created\) notFound\(\)/);
  assert.match(actions, /if \(!updated\) notFound\(\)/);
});

test("equipment mutations are exposed only through owner-scoped repository methods", () => {
  assert.match(repositoryPort, /createComponentForOwner\(assetId: string, systemId: string, ownerId: string/);
  assert.match(repositoryPort, /updateComponentForOwner\(assetId: string, systemId: string, componentId: string, ownerId: string/);
  assert.match(repositoryPort, /deleteComponentForOwner\(assetId: string, systemId: string, componentId: string, ownerId: string/);
  assert.match(repository, /INSERT INTO components[\s\S]*a\.id = \$\{assetId\} AND a\.owner_id = \$\{ownerId\}/);
  assert.match(repository, /UPDATE components c[\s\S]*a\.id = \$\{assetId\} AND a\.owner_id = \$\{ownerId\}/);
  assert.match(repository, /DELETE FROM components c USING systems s, assets a[\s\S]*a\.id = \$\{assetId\} AND a\.owner_id = \$\{ownerId\}/);
});
