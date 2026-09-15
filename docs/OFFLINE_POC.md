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

## Governing principle

> Ernest owns the knowledge; models reason over it; cloud connectivity enhances Ernest but is not required for Ernest to know the asset.

## Completed proof

Slices A-C proved package export, local retrieval, local Ollama grounding, and unsupported-answer refusal with WAN disconnected. The old Surface is not representative deployment hardware and is not a performance target.

## Slice D — Boat-local runtime

Target: browser on laptop/tablet/phone → local Ernest HTTP server → local knowledge/retrieval → replaceable model routing → grounded answer and sources.

### D1 runtime boundaries
Implemented: LAN-capable dependency-light HTTP service; separate knowledge, retrieval, outbox, sync-planner, model-adapter modules; persistent ignored `runtime-data/`; server-side Ollama calls; local UI and preview harness.

### D2 persistence and sync boundary
Implemented package format v2 with asset/package IDs, SHA-256 content revision, protocol metadata, persistent local sync state, backward compatibility, and runtime status reporting. SQLite remains a possible later implementation behind the same boundary.

### D3 Cloud → Boat
Implemented authenticated conditional cloud export, local revision planning, integrity verification, staged snapshot replacement, startup state reconciliation, and `/api/sync/apply`. Matching revisions perform no replacement. This is intentionally a correctness-first full snapshot protocol until change tracking/tombstones justify deltas.

### D4 first Boat → Cloud write: operating log
Structurally implemented while mutation remains disabled by default. Local operating-log writes persist atomically in `runtime-data/outbox.json`, are searchable immediately, carry UUID idempotency keys, and track queued/failed/synced state. Upload batches and reconciliation are represented locally. Cloud validation and owner-scoped idempotent persistence are implemented using the existing `log_entries.id` primary key. POST ingestion refuses writes unless `ERNEST_OFFLINE_LOG_UPLOAD_ENABLED=true`; keep this flag off until authentication/write activation is explicitly approved.

Intended lifecycle:
local entry → immediate local knowledge → persistent outbox → upload batch → owner-scoped idempotent cloud insert → result → local reconciliation → future refreshed cloud snapshot.

### D5 one-Ernest model routing boundary
Started without adding any cloud dependency. The local runtime now calls a model router rather than Ollama directly. Current `auto` routing deliberately resolves to the local Ollama adapter only. Runtime status exposes preferred/local/cloud/fallback availability, and answer responses identify the selected route and adapter.

This is an architectural seam, not cloud fallback activation. A future cloud adapter can be attached to the router without changing knowledge ownership, retrieval, or the browser API. Offline behavior therefore remains first-class rather than a fallback mode.

## Deferred hardware acceptance

When representative onboard hardware is available:
1. start local Ernest and verify package/state/outbox survive restart;
2. create an offline operating-log entry and verify restart persistence and local retrieval;
3. disconnect WAN and verify Q&A;
4. access Ernest from a second device on the same LAN;
5. exercise Cloud→Boat refresh;
6. only after explicit write activation approval, exercise Boat→Cloud operating-log sync;
7. measure latency, RAM, accelerator use, power, and storage.

Do not spend additional time performance-tuning the old Surface. Do not rerun expensive Ollama tests for routine architectural changes.

## Longer-term roadmap

1. Complete representative-hardware runtime acceptance.
2. Activate safe Cloud→Boat synchronization client.
3. Activate first Boat→Cloud write after authentication review.
4. Extend the model router to Auto / Local / Cloud while preserving local-first knowledge ownership.
5. Add agentic actions over the structured knowledge base.
6. Add boat integrations such as Signal K/NMEA2000, AIS/GPS, Victron/BMS, tanks, engine data, weather, and alarms.

Do not let integrations displace the knowledge foundation.
