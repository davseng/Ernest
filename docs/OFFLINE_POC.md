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
- broad offline editing
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
5. Persist selected local writes in an outbox while disconnected.
6. Require no network request during offline read/query operation.

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
- each package includes a sync protocol version, asset ID, unique package ID, SHA-256 package revision, direction, full-snapshot marker, base revision, and future cursor field;
- the package revision is derived from exported knowledge/evidence content;
- importing a package creates persistent `runtime-data/local-state.json` metadata alongside the knowledge package;
- local state records last cloud import, package revision/version, protocol version, Cloud→Boat mode, Boat→Cloud mode, and pending-local-write count;
- older version-1 POC packages remain importable through fallbacks;
- `/api/status` exposes local storage/sync state.

SQLite remains a likely later storage implementation behind the same boundary, not a change to the knowledge model.

#### D3 — Cloud → Boat sync and safe snapshot replacement

Implemented on the experiment branch:

1. Authenticated cloud route `/assets/[id]/offline-sync` accepts the boat's current `revision` as a query parameter.
2. Cloud compares its content-derived revision to the boat revision.
3. Matching revisions return `status: current` and no package payload.
4. Different/missing revisions return `status: update` plus a fresh full package.
5. Local `sync-planner.mjs` returns `none`, `replace-full-snapshot`, `reject`, or `unsupported`.
6. `/api/sync/plan` exposes that decision separately from retrieval/model logic.
7. Version-2 packages are integrity-checked locally by recomputing SHA-256.
8. Incoming snapshots are staged, parsed, verified, renamed into place, read back, and verified again before activation.
9. `local-state.json` uses its own atomic temporary-file rename and advances only after package replacement succeeds.
10. `/api/sync/apply` combines planning and verified application; unchanged revisions perform no write.

This remains a correctness-first full-refresh protocol. The cloud is authoritative and no local write is uploaded yet.

Remaining D3 work that depends on representative hardware/network access:

- add the authenticated boat-side cloud client;
- exercise end-to-end Cloud→Boat refresh on the onboard runtime;
- later add cursor/entity deltas where stable change markers exist.

#### D4 — First offline write: operating-log outbox

Local outbox scaffolding is now implemented without enabling cloud ingestion:

- `runtime-data/outbox.json` persists queued local writes atomically;
- `/api/log` accepts one local operating-log entry while an asset package is loaded;
- supported log types match the cloud domain: `note`, `maintenance`, `passage`, `observation`, and `incident`;
- each queued item gets an immutable client-generated UUID (`clientMutationId`) intended to become the future idempotency key;
- payload includes asset ID, occurred-at time, type, title, body, optional latitude/longitude, and source `manual`;
- queue metadata includes status, attempt count, last error, created/updated time, synced time, and future cloud ID;
- `/api/outbox` returns queued records and summary counts;
- `/api/status` includes outbox summary;
- `local-state.json.pendingLocalWrites` is kept in sync with queued/failed items;
- `boatToCloudMode` explicitly records `outbox-disabled-upload`;
- cloud upload/ingestion is intentionally not implemented yet.

This creates a durable local write contract without risking a cloud mutation. The next D4 step is to design and review the authenticated idempotent cloud ingestion contract before any upload path is enabled.

A later refinement should also make queued local log entries immediately available to local retrieval so Ernest can reason over facts recorded during an offline passage before they have synced to cloud.

#### Deferred hardware acceptance

When representative onboard hardware is available:

1. start local Ernest;
2. verify package, sync state, and outbox survive restart;
3. create an offline operating-log entry and verify it remains queued after restart;
4. disconnect WAN and verify Q&A;
5. access Ernest from a second device on the same LAN;
6. verify supported-answer and refusal behavior;
7. then measure latency, RAM, accelerator use, power, and storage.

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
