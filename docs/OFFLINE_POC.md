# Ernest Offline Proof of Concept

## Purpose

Answer one architectural question before building more features:

> Can Ernest provide genuinely useful, grounded answers about an asset with no internet connection?

This is an experiment, not a release feature. Production remains unchanged on `main`.

## Baseline

- Production baseline: Ernest v0.8.1 (`b7b0fa0d3826a6753c0bfeccadcf54b2b11b89cc`).
- Experiment branch: `feature/offline-poc`.
- Far Better is the test asset.
- The existing cloud database remains authoritative.
- Never run the legacy seed.
- Never invent asset facts.

## Phase 1 success criterion

With the test computer disconnected from the internet, a local Ernest prototype can answer a representative set of questions using Far Better's exported knowledge and clearly refuse when the local evidence does not support an answer.

The prototype should preserve Ernest's trust model: source-backed information remains distinguishable from owner-provided structured facts, and conversation is not evidence.

## Deliberately out of scope

Phase 1 will NOT implement:

- two-way synchronization
- offline writes or edits
- conflict resolution
- authentication redesign
- multi-user sharing
- photo understanding
- weather or routing
- automatic document ingestion
- production UI replacement
- automatic model installation

## Experiment architecture

Cloud Ernest

1. Produce a portable offline package for one owner-scoped asset.
2. Reuse the existing versioned asset export for structured knowledge.
3. Add the document text/chunks needed for grounded local retrieval.
4. Do not expose R2 storage keys or create permanent public URLs.

Local Ernest

1. Load the package into a small local store/index.
2. Retrieve relevant structured facts and document passages locally.
3. Send only that retrieved context to a locally running model.
4. Return an answer with local source references or refuse when evidence is insufficient.
5. Require no network request during the offline question/answer test.

## Build slices

### Slice A — Offline package

Create an authenticated owner-scoped download that contains:

- existing structured asset export
- document metadata
- extracted document pages/chunks with document title and page provenance
- procedures/checklists
- equipment and lifecycle state
- inventory and locations
- operating history

For the POC, a JSON package is acceptable. Original PDFs and photos do not need to be embedded yet.

Acceptance: inspect the downloaded package and verify it contains enough Far Better knowledge to reproduce several known cloud answers without querying Neon or R2.

### Slice B — Local retrieval harness

Create a minimal local-only program that:

- loads the offline package from disk
- searches structured data and document text
- returns the most relevant evidence for a question
- shows document/page provenance
- makes no network calls

Acceptance: with networking disabled, retrieval finds useful evidence for known Far Better questions.

### Slice C — Local model

Connect the retrieval harness to a locally running model through a local endpoint/runtime. Keep the model adapter replaceable so the experiment can compare models later.

Acceptance: with networking disabled, ask 30–50 representative questions and score answer correctness, refusal quality, latency, RAM, storage and CPU/GPU usage.

## Initial question set

Include questions such as:

- What engine is installed on Far Better?
- What impeller part number is in the maintenance records?
- What oil was used at the last recorded oil change?
- Where is a named spare stored?
- Show the steps in a named checklist.
- What does the relevant manual say about a specific maintenance task?
- When was a specific recorded service performed?
- Ask several questions that are NOT supported by the package and verify Ernest refuses rather than guessing.

## Decision after the POC

If local answer quality is useful, design offline as a core Ernest architecture: packaging, incremental sync, local originals, writes/conflicts and hardware targets.

If local answer quality or hardware requirements are poor, stop the offline work without disturbing production and proceed to the next cloud feature release (likely Empty the Box / ingestion).
