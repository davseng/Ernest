import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionSource = await readFile(new URL("../src/app/assets/[id]/ask-actions.ts", import.meta.url), "utf8");
const answerSource = await readFile(new URL("../src/data/ask-ernest.ts", import.meta.url), "utf8");
const proposalSource = await readFile(new URL("../src/data/ernest-write-proposals.ts", import.meta.url), "utf8");

test("Ask Ernest derives owner from authenticated session and preserves grounded competence", () => {
  assert.match(actionSource, /getErnestDocumentContext\(\s*assetId,\s*session\.user\.id,\s*retrievalQuestion\(question, conversation\)\s*\)/);
  assert.doesNotMatch(actionSource, /ownerId.*formData/);
  assert.match(answerSource, /Never turn general knowledge, inference, ambiguous text, or conversation into a verified fact about this asset/);
  assert.match(answerSource, /still give useful general domain expertise/);
  assert.match(answerSource, /Never claim an action was completed unless the application explicitly confirms it was completed/);
});

test("Ask Ernest uses conversation only to recover retrieval subjects for short follow-ups", () => {
  assert.match(actionSource, /function looksLikeFollowUp/);
  assert.match(actionSource, /ownerTurns/);
  assert.match(actionSource, /priorOwnerQuestion/);
  assert.doesNotMatch(actionSource, /conversation\\.slice\\(-1200\\)/);
  assert.match(actionSource, /context only, not verified evidence/);
});

test("Ask Ernest turns definite clarification answers into confirmation-gated learning", () => {
  assert.match(actionSource, /function clarificationContext/);
  assert.match(actionSource, /function clarificationQuestion/);
  assert.match(actionSource, /paragraphs\.slice\(-2\)\.reverse\(\)/);
  assert.match(actionSource, /function referencesEarlierQuestion/);
  assert.match(actionSource, /turns\.slice\(-3\)\.reverse\(\)/);
  assert.match(actionSource, /function learningProposalMessage/);
  assert.doesNotMatch(actionSource, /function clarificationFallback/);
  assert.match(actionSource, /getOwnerKnowledge\(assetId, session\.user\.id\)/);
  assert.match(actionSource, /Do not propose a write for opinions, plans, guesses, uncertain answers/i);
  assert.match(proposalSource, /Treat a definite answer as save intent/i);
  assert.match(proposalSource, /Use knowledge_fact for durable current facts/i);
  assert.match(proposalSource, /knowledge_fact rather than returning none/i);
});

test("Explicit confirmation-card requests must become proposals rather than simulated prose cards", () => {
  assert.match(proposalSource, /explicitly asks for a confirmation card, proposal, save card/i);
  assert.match(proposalSource, /that IS clear write intent/i);
  assert.match(proposalSource, /Do not answer with prose saying a card could be prepared/i);
  assert.match(proposalSource, /application itself will render the confirmation card/i);
  assert.match(proposalSource, /identity corrections/i);
});

test("Ask Ernest exposes approved procedures and lifecycle state as verified asset context", () => {
  assert.match(actionSource, /VERIFIED PROCEDURES:/);
  assert.match(actionSource, /lifecycleByComponent/);
  assert.match(actionSource, /getProcedures\(assetId, session\.user\.id\)/);
  assert.match(actionSource, /getComponentLifecycles\(assetId, session\.user\.id\)/);
});
