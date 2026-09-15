# Ernest Offline Proof of Concept

## Purpose
Prove Ernest can be genuinely useful and grounded about an asset without internet connectivity, then turn that proof into a safe onboard runtime. Production remains unchanged on `main`.

## Baseline
Production baseline is Ernest v0.8.1 (`b7b0fa0d3826a6753c0bfeccadcf54b2b11b89cc`). Experiment branch is `feature/offline-poc`; Far Better is the test asset. Cloud data remains authoritative; never seed shared environments or invent asset facts.

## Governing principle
> Ernest owns the knowledge; models reason over it; cloud connectivity enhances Ernest but is not required for Ernest to know the asset.

Slices A-C proved package export, local retrieval, local Ollama grounding, and unsupported-answer refusal with WAN disconnected. The old Surface is not representative deployment hardware or a performance target.

## Slice D — Boat-local runtime
Target: browser on laptop/tablet/phone → local Ernest HTTP server → local knowledge/retrieval → model router → grounded answer and sources.

### D1 runtime boundaries — implemented
LAN-capable dependency-light HTTP service; separate knowledge, retrieval, outbox, sync, model-adapter/router and configuration modules; persistent ignored `runtime-data/`; server-side Ollama; local UI; health/status endpoints; onboard readiness doctor.

### D2 persistence and sync boundary — implemented
Package v2 carries asset/package IDs, SHA-256 content revision and protocol metadata. Package replacement is staged/integrity checked; startup repairs sync metadata from the committed package after interrupted state writes. Pending local writes are preserved separately and block accidental asset replacement.

### D3 Cloud → Boat — implementation complete; activation/hardware acceptance pending
Cloud conditional export and local Cloud→Boat orchestration support revision no-op, update, offline, auth and error states. A newer package is validated before safe replacement. Asset-scoped boat-device authentication is now implemented: owner enrollment issues a one-time credential whose cloud record stores only a hash; devices are asset-bound, permission-scoped and revocable. Snapshot sync requires `snapshot:read`.

Migration `022_boat_devices.sql` is committed but has not been applied to production/shared Neon. No real credential has been created.

### D4 first Boat → Cloud write: operating log — implementation complete; doubly gated
Offline operating-log writes persist in `runtime-data/outbox.json`, are immediately searchable, use UUID idempotency keys and track queued/failed/synced state. Cloud ingestion validates a complete batch, verifies owner/asset access transactionally, rejects conflicting replay and commits atomically.

The onboard runtime now also has an upload client and reconciliation path, but it requires all of: a configured cloud endpoint, a boat credential, local `ERNEST_BOAT_LOG_UPLOAD_ENABLED=true`, device permission `operating-log:write`, and cloud `ERNEST_OFFLINE_LOG_UPLOAD_ENABLED=true`. Both write flags remain off. This makes read-only Cloud→Boat pairing independently deployable before any cloud mutation is allowed.

### D5 one-Ernest model routing boundary — implemented
The local runtime calls a model router rather than Ollama directly. `auto` deliberately resolves to local Ollama. Explicit local/cloud route intents exist, but cloud is unavailable unless an adapter is deliberately configured. Auto cloud fallback is separately opt-in and remains off.

## Safety invariants
- Production/main untouched until explicit merge approval.
- Device migration is code only until explicitly approved for an environment.
- Device credentials authorize only their asset and declared permissions.
- Boat→Cloud requires independent local and cloud write gates in addition to credential permission.
- Cloud-model fallback remains independent and off.
- Cloud outage never deletes the last good onboard snapshot.
- Pending local writes survive snapshot refreshes.
- Interactive Auth.js cookies are not the long-lived boat credential.

## Remaining Slice D acceptance
Representative onboard hardware must prove in one focused session: boot without WAN; automatic healthy startup; persisted Far Better knowledge; second-device LAN access; grounded answer/refusal; operating-log persistence/search across restart; read-only authenticated Cloud→Boat current/update behavior after WAN returns; pending-write preservation; write gates off; revocation behavior; and basic latency/RAM/storage/power measurements.

Only after that read-only proof should we deliberately grant `operating-log:write`, enable both write gates for one acceptance upload, verify cloud persistence/idempotent replay/local reconciliation, then turn the gates back off until release approval.

## Next gates
1. Choose representative onboard hardware/runtime target.
2. Package Ernest as an auto-starting appliance with protected local credential storage.
3. Explicitly approve applying migration 022 in the chosen test environment and pair Far Better read-only.
4. Run the single hardware/read-only sync acceptance session.
5. Separately exercise Boat→Cloud under controlled write activation.
6. Then mature Auto/Local/Cloud routing and bidirectional sync before boat integrations.

Do not performance-tune or repeatedly run Ollama acceptance questions on the old Surface. Do not let integrations displace the knowledge foundation.
