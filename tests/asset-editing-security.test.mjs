import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile("src/data/postgres-asset-repository.ts", "utf8");
const action = await readFile("src/app/assets/[id]/edit/actions.ts", "utf8");
const page = await readFile("src/app/assets/[id]/edit/page.tsx", "utf8");

test("asset updates constrain both asset id and authenticated owner", () => {
  assert.match(repository, /WHERE id = \$\{id\} AND owner_id = \$\{ownerId\}/);
  assert.match(repository, /RETURNING id/);
  assert.match(action, /updateAsset\(assetId, session\.user\.id,/);
});

test("ownership identity cannot be supplied through the edit form", () => {
  assert.doesNotMatch(action, /formData\.get\(["'](?:owner|ownerId|assetId|id)["']\)/);
  assert.match(action, /if \(!session\?\.user\?\.id\) redirect\("\/sign-in"\)/);
});

test("the edit page loads the asset through the owner-scoped read", () => {
  assert.match(page, /getAsset\(id, session\.user\.id\)/);
  assert.match(page, /if \(!asset\) notFound\(\)/);
});
