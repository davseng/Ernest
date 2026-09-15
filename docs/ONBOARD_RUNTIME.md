# Ernest onboard runtime contract

This document defines the deployment target for the boat computer. It is intentionally hardware-neutral until representative hardware is selected.

## Runtime shape

One always-available onboard computer runs:
- Ernest local HTTP runtime on the boat LAN;
- persistent `runtime-data/` containing the verified asset snapshot, local sync state, and write outbox;
- Ollama on loopback by default;
- no Neon, R2, Vercel, or internet dependency for local knowledge, retrieval, operating-log capture, or local-model answers.

Phones, tablets, and laptops are thin clients. They need only a browser and access to the boat LAN.

## Configuration

Supported runtime environment variables:
- `ERNEST_OFFLINE_HOST` — defaults to `0.0.0.0` so the runtime can serve the LAN.
- `ERNEST_OFFLINE_PORT` — defaults to `3210`.
- `OLLAMA_BASE_URL` — defaults to `http://127.0.0.1:11434`.

Cloud synchronization credentials are deliberately not defined yet. Do not store an interactive browser session cookie as the long-lived boat credential. The eventual machine credential must be asset-scoped, revocable, and suitable for unattended sync.

## Operational contracts

`GET /api/health` is the process/appliance health endpoint. It reports runtime uptime, whether knowledge is loaded, the asset ID, pending local writes, write-sync enablement, and model-router policy without requiring Ollama to answer a question.

`GET /api/status` is the richer operator status endpoint.

`npm run offline:doctor` checks Node, persistent runtime files, and Ollama availability. It is intended for installation and troubleshooting, not normal daily use.

The service manager on the final hardware should:
1. start Ollama;
2. start Ernest after local storage is mounted;
3. restart Ernest after a crash;
4. start both services at boot without WAN access;
5. keep `runtime-data/` on persistent local storage;
6. expose Ernest only to the trusted boat LAN unless a later security design explicitly changes that boundary.

## Sync state machine

Cloud → Boat transport now distinguishes `offline`, `authentication-required`, `current`, `update`, and `error`. Package replacement remains integrity-checked and staged before commit. Startup reconciles sync metadata from the committed package if a crash occurred between those writes.

Boat → Cloud remains disabled. Local operating-log entries remain durable and searchable while queued. Cloud ingestion rejects idempotency-key reuse with different content.

## Hardware acceptance gate

Slice D is not hardware-accepted until representative onboard hardware proves all of the following in one focused session:
- boot with WAN disconnected;
- Ernest starts automatically and `/api/health` is healthy;
- existing Far Better knowledge is present after restart;
- a second device reaches Ernest over boat Wi-Fi/LAN;
- a grounded local-model answer works offline;
- an unsupported question refuses rather than inventing an answer;
- a new operating-log entry survives restart and is locally searchable;
- Cloud → Boat detects current/update correctly after WAN returns;
- pending local writes remain intact across a cloud snapshot refresh;
- Boat → Cloud is still off unless separately approved;
- CPU/RAM/storage/power and response latency are recorded for hardware selection.

## Explicit non-goals for this slice

- no boat sensor integrations yet;
- no autonomous cloud writes;
- no cloud-model fallback activation;
- no production/main merge without explicit approval;
- no performance tuning around the old Surface.
