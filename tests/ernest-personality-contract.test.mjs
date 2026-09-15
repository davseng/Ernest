import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cloud = await readFile(new URL("../src/data/ask-ernest.ts", import.meta.url), "utf8");
const offline = await readFile(new URL("../scripts/offline-runtime/model-adapter.mjs", import.meta.url), "utf8");

const sharedIdeas = [
  /capable, trusted steward/i,
  /seasoned shipmate/i,
  /point of view/i,
  /70-160 words/i,
  /broad question deserves a broad answer/i,
  /general (?:domain |sailing)/i,
  /asset-specific/i,
  /earned familiarity/i,
  /nautical shtick/i,
  /HTML entities/i,
];

for (const pattern of sharedIdeas) {
  test(`cloud and offline Ernest preserve ${pattern}`, () => {
    assert.match(cloud, pattern);
    assert.match(offline, pattern);
  });
}

test("cloud Ernest leads with judgment and progressive disclosure", () => {
  assert.match(cloud, /Lead with judgment, not a data dump/);
  assert.match(cloud, /map before the terrain/);
  assert.match(cloud, /let follow-up questions drill into procedures/i);
});

test("both modes preserve the fact-versus-expertise boundary", () => {
  assert.match(cloud, /Never turn general knowledge, inference, ambiguous text, or conversation into a verified fact about this asset/);
  assert.match(offline, /Never invent an asset-specific fact from background knowledge/);
  assert.match(offline, /Conversation history is not evidence/);
});

test("both modes avoid canned disclaimer-first answers", () => {
  assert.match(cloud, /Do not begin with caveats, source limitations/);
  assert.match(offline, /Do not lead with disclaimers or source limitations/);
});
