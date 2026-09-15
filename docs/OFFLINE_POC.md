# Ernest Offline Proof of Concept

## Purpose

Prove that Ernest can be genuinely useful and grounded about an asset without internet connectivity, then turn that proof into a safe onboard runtime. Production remains unchanged on `main`.

## Baseline

- Production baseline: Ernest v0.8.1 (`b7b0fa0d3826a6753c0bfeccadcf54b2b11b89cc`).
- Experiment branch: `feature/offline-poc`.
- Far Better is the test asset.
- Cloud data remains authoritative; never seed shared environments or invent asset facts.

## Governing principle

> Ernest owns the knowledge; models reason over it; cloud connectivity enhances Ernest but is not required for Ernest to know the asset.

## Completed proof

Slices A-C proved package export, local retrieval, local Ollama grounding, and unsupported-answer refusal with WAN disconnected. The old Surface is not representative deployment hardware or a performance target.

## Slice D — Boat-local runtime

Target: browser on laptop/tablet/phone → local Ernest HTTP server → local knowledge/retrieval → replaceable model routing → grounded answer and sources.

### D1 runtime boundaries — implemented
LAN-capable dependency-light HTTP service; separate knowledge, retrieval, outbox, sync, model-adapter/router, and configuration modules; persistent ignored `runtime-data/`; server-side Ollama; local UI; health/status endpoints; and an onboard readiness doctor.

### D2 persistence and sync boundary — implemented
Package v2 includes asset/package IDs, SHA-256 content revision, protocol metadata, persistent local sync state and backward compatibility. Package replacement is staged and integrity checked. Startup reconciles state from the committed package after an interrupted state write.

### D3 Cloud → Boat — implementation complete pending machine auth/hardware acceptance
The cloud endpoint supports conditional export by package revision and machine-readable auth errors. The local runtime now has an executable Cloud → Boat client/orchestrator: it sends the last imported revision, distinguishes not-configured/offline/auth/current/update/error, validates asset/protocol through the planner, and imports a newer verified package. Offline/auth failures leave current local knowledge untouched. Full snapshots remain the correctness-first protocol until deltas are justified.

The transport accepts an authorization seam, but unattended boat credentials are deliberately not implemented. See `docs/BOAT_SYNC_AUTH.md`.

### D4 first Boat → Cloud write: operating log — implementation complete but activation gated
Local operating-log writes persist in `runtime-data/outbox.json`, become searchable immediately, carry UUID idempotency keys, and track queued/failed/synced state. Upload batch/result reconciliation validates protocol, asset and mutation identity before changing local state.

Cloud ingestion validates the complete batch, verifies owner/asset access once inside a database transaction, checks idempotent replay payload equality, and commits the batch atomically. A conflict rolls the transaction back instead of partially applying a batch. POST ingestion still refuses writes unless `ERNEST_OFFLINE_LOG_UPLOAD_ENABLED=true`; keep this flag off until machine authentication and write activation are explicitly approved.

Lifecycle: local entry → immediate local knowledge → persistent outbox → upload batch → asset-scoped/idempotent cloud insert → result → local reconciliation → refreshed cloud snapshot.

### D5 one-Ernest model routing boundary — implemented
The local runtime calls a model router rather than Ollama directly. `auto` deliberately resolves to local Ollama. Explicit local/cloud route intents exist, but cloud is unavailable unless an adapter is deliberately configured. Auto cloud fallback is separately opt-in and remains off. Runtime status exposes the routing policy and answer responses identify route/adapter.

A future cloud adapter can attach without changing knowledge ownership, retrieval, or the browser API. Offline remains first-class rather than a fallback mode.

## Safety invariants

- Production/main is untouched until explicit merge approval.
- Boat → Cloud is off by default and is not activated by Cloud → Boat configuration.
- Cloud-model fallback is off by default and independent of sync connectivity.
- A cloud outage never deletes the last good onboard snapshot.
- Pending local writes are separate from cloud snapshots and survive snapshot refreshes.
- Interactive Auth.js cookies are not the long-lived boat credential.

## Deferred hardware acceptance

On representative onboard hardware, perform one focused acceptance session: boot without WAN; verify automatic healthy startup and persistence; reach Ernest from a second LAN device; prove grounded answer/refusal; create and recover an operating-log entry across restart; reconnect WAN and prove Cloud → Boat current/update behavior without losing pending writes; verify Boat → Cloud remains off; record latency/RAM/storage/power. Only after separate authentication/write approval should a Boat → Cloud upload be exercised.

Do not performance-tune or repeatedly run Ollama acceptance questions on the old Surface.

## Next gates

1. Review/approve the asset-scoped boat-device authentication design.
2. Implement pairing/revocation only after that approval; keep cloud writes disabled during implementation.
3. Select representative onboard hardware and package Ernest as an auto-starting appliance.
4. Run the single hardware acceptance session.
5. Then mature Auto / Local / Cloud routing and bidirectional synchronization before boat integrations.

Do not let integrations displace the knowledge foundation.
