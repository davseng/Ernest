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

Phase 1 will NOT implement production two-way synchronization, broad offline editing, conflict resolution, authentication redesign, multi-user sharing, photo understanding, weather/routing, automatic document ingestion, production UI replacement, or automatic model installation.

## Experiment architecture

Cloud Ernest produces an owner-scoped package using the existing structured export plus extracted document text/chunks and provenance. Original PDFs/photos and storage credentials remain outside the offline package.

Local Ernest loads that package, retrieves structured/document evidence locally, calls a replaceable local model adapter, returns grounded answers or refusals, persists selected offline writes in an outbox, and makes those new local facts searchable immediately.

## Build slices

### Slice A — Offline package

Acceptance completed. The package contains sufficient Far Better structured knowledge and document evidence for useful local retrieval and grounded answers.

### Slice B — Local retrieval harness

Acceptance completed with networking disabled.

### Slice C — Local model

Functional proof completed: Far Better knowledge was loaded locally, evidence was retrieved locally, Ollama produced a grounded answer, and Ernest refused an unsupported question with Wi-Fi disconnected.

The current Surface is not representative deployment hardware. Additional local-model questions are reserved for milestone acceptance rather than routine development.

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

Implemented on `feature/offline-poc`:

- dependency-light local HTTP service;
- LAN-capable bind (`0.0.0.0`);
- separate knowledge-store, retrieval, outbox, sync-planner, and model-adapter modules;
- imported package persistence under ignored `runtime-data/`;
- server-side retrieval and Ollama calls;
- explicit labeled evidence and refusal behavior;
- Vercel Boat runtime preview for UI/trust-behavior development while representative local hardware is unavailable.

#### D2 — Persistence and sync boundary

Implemented:

- offline package format version 2;
- sync protocol version, asset ID, package ID, SHA-256 package revision, direction, full-snapshot marker, base revision, and future cursor;
- content-derived package revision;
- persistent `runtime-data/local-state.json`;
- last cloud import/revision, package version, protocol version, Cloud→Boat mode, Boat→Cloud mode, and pending-write count;
- backward compatibility for version-1 POC packages;
- `/api/status` exposes storage and sync state.

SQLite remains a likely later storage implementation behind the same boundary, not a change to the knowledge model.

#### D3 — Cloud → Boat sync and safe snapshot replacement

Implemented:

1. Authenticated cloud route `/assets/[id]/offline-sync` accepts the boat revision.
2. Matching revision returns `status: current` with no package payload.
3. Different/missing revision returns `status: update` plus a fresh package.
4. Local sync planning returns `none`, `replace-full-snapshot`, `reject`, or `unsupported`.
5. Version-2 packages are integrity-checked by recomputing SHA-256.
6. Incoming snapshots are staged, parsed, verified, renamed into place, read back, and verified before activation.
7. Local sync state advances only after package replacement succeeds.
8. `/api/sync/apply` combines planning and safe application.

This remains a correctness-first full-refresh protocol. Representative hardware acceptance and the authenticated boat-side cloud client are deferred.

#### D4 — First offline write: operating log

The offline operating-log round-trip is now structurally implemented while cloud mutation remains disabled by default.

Local runtime:

- `runtime-data/outbox.json` persists local writes atomically;
- `/api/log` queues a local entry for the currently loaded asset;
- supported types: `note`, `maintenance`, `passage`, `observation`, `incident`;
- immutable client-generated UUID is the future idempotency key;
- payload includes occurred-at, type, title, body, optional latitude/longitude, and source `manual`;
- queue metadata tracks queued/failed/synced state, attempts, last error, timestamps, and cloud ID;
- queued/failed entries are merged into local retrieval immediately with `source: local-outbox` provenance;
- synced entries leave the local overlay so later cloud snapshots do not duplicate evidence;
- `/api/outbox` exposes queue state;
- `/api/outbox/upload-batch` builds the Boat→Cloud protocol envelope without transmitting it;
- `/api/outbox/reconcile` consumes a successful cloud result and marks matching entries synced;
- `/api/status` exposes pending-write and total-local-knowledge counts;
- the local UI now includes runtime metrics, a local operating-log form, queue visibility, and explicit Cloud Upload Off status.

Cloud side:

- server-only batch validation verifies protocol, asset, entry type, timestamps, coordinates, and matching idempotency keys;
- `clientMutationId` maps directly to existing `log_entries.id`, so the PostgreSQL primary key is the idempotency boundary without a migration;
- idempotent persistence is owner-scoped and distinguishes newly created vs already-existing records;
- POST on `/assets/[id]/offline-sync` is wired to that persistence helper;
- **the route refuses writes unless `ERNEST_OFFLINE_LOG_UPLOAD_ENABLED=true`**;
- that flag must remain off until Boat→Cloud authentication/write activation is explicitly approved.

The full intended lifecycle is therefore represented in code:

local entry → immediate local knowledge → persistent outbox → upload batch → owner-scoped idempotent cloud insert → result → local reconciliation → future refreshed cloud snapshot.

The remaining D4 dependency is not data modeling; it is the authenticated boat-side sender/credential design and representative-hardware/network testing.

#### Deferred hardware acceptance

When representative onboard hardware is available:

1. start local Ernest;
2. verify package, sync state, and outbox survive restart;
3. create an offline operating-log entry and verify it survives restart;
4. verify the queued entry is retrievable locally before cloud sync;
5. disconnect WAN and verify Q&A;
6. access Ernest from a second device on the same LAN;
7. exercise Cloud→Boat refresh and, only after write activation approval, Boat→Cloud operating-log sync;
8. measure latency, RAM, accelerator use, power, and storage.

Do not spend additional time performance-tuning the old Surface.

## Minimal acceptance questions

The supported-answer and unsupported-answer trust behaviors have already been demonstrated. Do not rerun expensive Ollama tests for routine architectural changes.

## Longer-term roadmap

1. Local runtime and persistence boundary.
2. Cloud→Boat synchronization.
3. First Boat→Cloud write (operating log).
4. Automatic local/cloud model routing so Ernest behaves as one assistant.
5. Agentic actions over the structured knowledge base.
6. Boat integrations such as Signal K/NMEA2000, AIS/GPS, Victron/BMS, tanks, engine data, weather, and alarms.

Do not let integrations displace the knowledge foundation.
