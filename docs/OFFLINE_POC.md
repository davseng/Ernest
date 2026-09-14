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

- production two-way synchronization
- general offline writes or edits
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

1. Load the package into a local knowledge-store boundary.
2. Retrieve relevant structured facts and document passages locally.
3. Send only that retrieved context to a locally running model.
4. Return an answer with local source references or refuse when evidence is insufficient.
5. Require no network request during the offline question/answer test.

## Build slices

### Slice A — Offline package

Create an authenticated owner-scoped download containing structured knowledge plus extracted document text and provenance. Original PDFs/photos remain outside the POC package.

Acceptance completed: the package contains sufficient Far Better knowledge for useful local retrieval and grounded answers.

### Slice B — Local retrieval harness

Create a local-only retrieval program that loads the package, searches structured data/document text, and shows source/page provenance.

Acceptance completed with networking disabled.

### Slice C — Local model

Connect local retrieval to a locally running model through a replaceable adapter.

Functional proof completed: the locally opened POC loaded Far Better knowledge, retrieved asset-specific evidence, called local Ollama, produced a grounded supported answer, and refused an unsupported question with Wi-Fi disconnected.

The current Surface is not representative deployment hardware. Local-model questions take roughly ten minutes and can overwhelm that machine, so additional model calls are reserved for milestone acceptance tests rather than routine development. Detailed performance testing is deferred until representative onboard hardware is available.

### Slice D — Boat-Local Ernest Runtime

Target architecture:

Browser on laptop/tablet/phone
→ local Ernest HTTP server
→ local Ernest knowledge store
→ local retrieval
→ replaceable model adapter
→ Ollama (or future local model runtime)
→ grounded answer + sources

Governing principle:

> Ernest owns the knowledge; models reason over it; cloud connectivity enhances Ernest but is not required for Ernest to know the asset.

#### D1 — Runtime boundaries

Implemented on `feature/offline-poc` without changing production behavior:

- dependency-light local HTTP service;
- LAN-capable bind (`0.0.0.0`) for later onboard testing;
- separate knowledge-store, retrieval, and model-adapter modules;
- imported package persistence under ignored `runtime-data/`;
- server-side retrieval and Ollama calls;
- explicit labeled structured evidence;
- Vercel Boat runtime preview for UI/trust-behavior development while local hardware execution is deferred.

The existing browser-only Slice B/C harness remains as a proof artifact.

#### D2 — Persistence and sync boundary

Implemented as architecture scaffolding while the cloud remains authoritative:

- offline package format advanced to version 2;
- each package now includes a sync protocol version, asset ID, unique package ID, SHA-256 package revision, direction, full-snapshot marker, base revision, and future cursor field;
- the package revision is derived from the exported knowledge/evidence content, so later sync logic can distinguish unchanged vs changed cloud state;
- importing a package creates persistent `runtime-data/local-state.json` metadata alongside the knowledge package;
- local state records last cloud import, package revision/version, protocol version, Cloud→Boat mode, Boat→Cloud mode, and pending-local-write count;
- older version-1 POC packages remain importable through fallbacks;
- `/api/status` exposes the local storage/sync state for future UI and synchronization logic.

This deliberately does **not** implement network synchronization yet. It creates the contract needed to evolve from today's full snapshot into incremental Cloud→Boat synchronization without coupling retrieval/model code to the storage mechanism.

The next persistence step may replace JSON storage with SQLite behind the same knowledge-store boundary. That is an implementation choice, not a change to Ernest's knowledge model.

#### Planned D3 — Incremental Cloud → Boat sync

Design and implement the first real synchronization flow:

1. Boat reports asset ID + last imported package revision/cursor.
2. Cloud determines whether knowledge has changed.
3. If unchanged, transfer nothing.
4. If changed, initially allow a fresh full snapshot behind the sync protocol.
5. Evolve entity families to delta transfer as stable change markers become available.
6. Apply updates atomically to the local store and advance local sync state only after success.

This keeps correctness ahead of bandwidth optimization: a versioned full refresh is acceptable before fine-grained deltas.

#### Planned D4 — First Boat → Cloud write

The operating log remains the preferred first offline write because it is append-oriented and comparatively low-conflict. The intended design is a local outbox with immutable client-generated entry IDs, sync status, retry state, and idempotent cloud ingestion. This is not implemented yet.

#### Deferred hardware acceptance

When representative onboard hardware is available:

1. start local Ernest;
2. verify the package/store survive restart;
3. disconnect WAN and verify Q&A;
4. access Ernest from a second device on the same LAN;
5. verify supported-answer and refusal behavior;
6. then measure latency, RAM, accelerator use, power, and storage.

Do not spend additional time performance-tuning the old Surface.

## Minimal acceptance questions

Because the current Surface is slow, keep local-model acceptance to the minimum needed:

- one known supported question;
- one deliberately unsupported question.

Those two trust behaviors have already been demonstrated for the current Slice D preview. Do not rerun them for every architectural change.

## Longer-term roadmap

1. Local runtime and persistence boundary.
2. Incremental Cloud→Boat synchronization.
3. First Boat→Cloud write (operating log).
4. Automatic local/cloud model routing so Ernest behaves as one assistant.
5. Agentic actions over the structured knowledge base.
6. Boat integrations such as Signal K/NMEA2000, AIS/GPS, Victron/BMS, tanks, engine data, weather, and alarms.

Do not let integrations displace the knowledge foundation.
