# Onboard Ernest deployment checklist

This is the hardware-neutral packaging contract for the eventual Far Better computer. It does not select hardware or operating system.

## Required software

- Node.js 20.9+ for the Ernest local runtime.
- Ollama reachable on loopback or another explicitly trusted local address.
- One installed local model chosen during hardware acceptance.
- A service manager capable of starting both services at boot and restarting Ernest after failure.

The onboard computer does **not** need Neon, R2, Vercel, a local PostgreSQL server, Git, or development tooling to answer from an already imported package.

## Persistent data

Keep `runtime-data/` on durable local storage. It contains the active verified knowledge package, local sync metadata, and the operating-log outbox. The outbox is the highest-value backup target because it may contain observations created aboard that do not yet exist in cloud Ernest.

Never place `runtime-data/` in the application release directory if upgrades replace that directory. Application code should be replaceable without replacing onboard data.

## Runtime configuration

- LAN host defaults to `0.0.0.0`; expose only to the trusted boat LAN.
- port defaults to `3210`.
- Ollama defaults to `http://127.0.0.1:11434`.
- Cloud snapshot endpoint is optional.
- Boat → Cloud writes and cloud-model fallback remain disabled independently of Cloud → Boat connectivity.
- The future device credential must be stored outside source control and outside browser storage.

## Boot sequence

1. mount persistent storage;
2. start Ollama;
3. start Ernest with `npm run offline` (or the packaged equivalent);
4. service manager restarts Ernest on process failure;
5. browser clients connect to the onboard computer's stable LAN hostname/address;
6. WAN availability is optional.

`GET /api/health` is the service-manager health probe. `npm run offline:doctor` is the installation/troubleshooting check.

## Upgrade/recovery contract

Before an application upgrade, preserve `runtime-data/`. After upgrade, start Ernest offline first and confirm the existing asset and pending-write count. A bad application upgrade must be recoverable by restoring the prior application version while retaining the same data directory.

A corrupt/new cloud package must never replace the last verified local package. A cloud outage or authentication failure must never erase local knowledge or queued writes.

## Acceptance session

The first representative-hardware test should be one concentrated session rather than repeated tests on the old Surface: cold boot without WAN, second-device LAN access, persisted knowledge, local model answer/refusal, offline log creation and restart recovery, WAN reconnect, Cloud → Boat current/update behavior, preservation of pending writes, and resource/power measurements.
