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

Functional proof completed: the locally opened POC page loaded the Far Better package, retrieved asset-specific evidence, called local Ollama, produced a grounded answer, and refused an unsupported question with Wi-Fi disconnected.

The current test Surface is not representative deployment hardware. Detailed latency/RAM/CPU/GPU benchmarking is deferred until representative onboard hardware is available. The important Slice C architectural path has been proven.

### Slice D — Boat-Local Ernest Runtime

The goal is to turn the browser-only experiment into the shape of an onboard Ernest service:

Browser on laptop/tablet/phone
→ local Ernest HTTP server
→ locally stored Ernest knowledge
→ server-side retrieval
→ replaceable local model adapter
→ Ollama
→ grounded answer + sources

The governing architectural principle is:

> Ernest owns the knowledge; models reason over it; cloud connectivity enhances Ernest but is not required for Ernest to know the asset.

#### D1 — Local runtime service

Implemented on `feature/offline-poc` without changing production behavior:

- `npm run offline` starts a dependency-light Node HTTP service on port 3210 by default.
- The service binds to `0.0.0.0` so LAN-device testing can be added later.
- A local UI is served from `public/offline-local.html`.
- The existing Ernest offline JSON package can be imported through the local UI.
- The package is copied into ignored `runtime-data/offline-package.json` and automatically reloaded after a server restart.
- Retrieval now runs server-side rather than in browser JavaScript.
- Structured evidence is rendered with explicit field labels such as Item, Quantity, Location, Model, and Source to reduce model ambiguity.
- Local model access is behind a server-side adapter boundary; D1 currently implements Ollama only.
- Ollama model discovery and `/api/chat` calls happen from the local Ernest server.
- Only the question and retrieved local evidence are sent to the selected local model.
- The prior `public/offline-poc.html` harness remains intact as the Slice B/C proof artifact.

D1 does **not** implement SQLite, two-way sync, offline writes, cloud routing, production UI replacement, or authentication redesign.

#### D1 acceptance test

On any available development computer with Node 20+ and Ollama:

1. Check out `feature/offline-poc` and install existing project dependencies if needed.
2. Run `npm run offline`.
3. Open `http://localhost:3210`.
4. Import a valid Ernest offline JSON package.
5. Connect to Ollama and choose an installed model.
6. Ask a supported question and verify a grounded answer with evidence/source references.
7. Ask an unsupported question and verify Ernest refuses rather than inventing a fact.
8. Stop the server completely.
9. Restart with `npm run offline` and verify the package is already loaded without re-importing it.
10. Disconnect WAN internet and repeat local Q&A.

The old Surface may be used for this functional proof, but its model latency is not an acceptance criterion. LAN access, power use, accelerator performance, and hardware sizing are deferred until representative boat hardware is available.

#### Planned D2/D3 work

After D1 is functionally verified:

- introduce a persistent local knowledge store (likely SQLite) behind a clean data-access boundary;
- keep the cloud database authoritative while sync remains one-way/export-driven;
- harden LAN access and test Ernest from a second device on the same local network;
- defer representative hardware performance, power, and storage testing until the intended onboard computer is available.

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
