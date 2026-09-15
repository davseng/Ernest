# Ernest onboard runtime contract

This document defines the deployment target for the boat computer. It is intentionally hardware-neutral until representative hardware is selected.

## Runtime shape

One always-available onboard computer runs Ernest local HTTP runtime on the boat LAN, persistent `runtime-data/`, and Ollama on loopback by default. Local knowledge, retrieval, operating-log capture, and local-model answers have no Neon, R2, Vercel, or WAN dependency. Phones, tablets, and laptops are thin browser clients.

## Configuration

- `ERNEST_OFFLINE_HOST` defaults to `0.0.0.0`.
- `ERNEST_OFFLINE_PORT` defaults to `3210`.
- `OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`.
- `ERNEST_CLOUD_SYNC_ENDPOINT` optionally configures the owner-scoped cloud snapshot endpoint.
- `ERNEST_CLOUD_SYNC_AUTHORIZATION` is a transport seam only; the final machine credential design is not approved yet.

Cloud snapshot configuration never enables Boat → Cloud writes or cloud-model fallback. Do not use an interactive browser session cookie as the long-lived boat credential. The eventual machine credential must be asset-scoped, revocable, and suitable for unattended sync.

## Operational contracts

`GET /api/health` reports appliance health without invoking a model. `GET /api/status` reports richer operator state. `POST /api/cloud-sync` checks the configured cloud snapshot using the last imported revision and safely applies a newer verified package. Offline/auth failures leave the current package untouched.

`npm run offline:doctor` checks Node, persistent runtime files, and Ollama availability. The final service manager should start Ollama and Ernest at boot, restart Ernest after a crash, preserve `runtime-data/`, work without WAN, and expose Ernest only to the trusted boat LAN.

## Sync state machine

Cloud → Boat now has an executable local orchestration path and distinguishes `not-configured`, `offline`, `authentication-required`, `current`, `updated`, and `error`. Revision matching avoids unnecessary replacement. Package replacement remains integrity-checked and staged before commit. Startup reconciles sync metadata from the committed package if a crash occurred between package and state writes.

Boat → Cloud remains disabled. Local operating-log entries remain durable and searchable while queued. Cloud ingestion rejects idempotency-key reuse with different content. Authentication for unattended Boat → Cloud sync remains the next security decision before activation.

## Hardware acceptance gate

Slice D is not hardware-accepted until representative onboard hardware proves, in one focused session: boot offline; automatic healthy startup; persisted Far Better knowledge; access from a second LAN device; grounded local answer and unsupported-question refusal; operating-log persistence/search after restart; Cloud → Boat current/update behavior after WAN returns; preservation of pending writes during snapshot refresh; Boat → Cloud still disabled; and recorded CPU/RAM/storage/power/latency.

## Explicit non-goals for this slice

No boat sensor integrations, autonomous cloud writes, cloud-model fallback activation, production/main merge without explicit approval, or performance tuning around the old Surface.
