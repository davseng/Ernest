# Boat sync authentication decision record

Status: **approved and implemented on `feature/offline-poc`; not activated in production**.

## Decision

Use a dedicated asset-scoped boat-device credential for unattended Ernest synchronization. Normal Auth.js browser sessions remain unchanged.

Each device has a UUID identity, one random 256-bit secret shown only at enrollment, a SHA-256 secret hash stored in cloud Ernest, one owner/asset assignment, explicit permissions, and created/last-used/revoked timestamps. The initial permissions are `snapshot:read` and separately `operating-log:write`.

## Pairing and revocation

An authenticated owner enrolls a device for a specific asset through the owner-only boat-device endpoint. The returned `BoatDevice <device-id>.<secret>` credential must be stored on the onboard machine; the raw secret is not stored by Ernest and cannot be displayed again. Revocation sets `revoked_at` and immediately prevents later machine authentication without changing the owner's login.

The migration is `022_boat_devices.sql`. It is committed for review but has **not** been run against production/shared Neon by this workstream.

## Sync authorization

The existing offline-sync endpoint accepts either the owner's normal interactive session or an asset-scoped boat credential. Snapshot GET requires `snapshot:read`. Operating-log POST requires `operating-log:write`. A device credential never authorizes normal Ernest UI/account/document APIs or another asset.

Boat→Cloud retains an independent deployment safety gate: even a valid write-scoped device receives `503 uploadEnabled:false` unless `ERNEST_OFFLINE_LOG_UPLOAD_ENABLED=true`. That flag remains off.

## Local transport

The onboard Cloud→Boat client already accepts an Authorization value and can therefore use the device credential without changing knowledge/retrieval/model architecture. The credential should eventually live in an OS-protected local configuration/secret store rather than source code or the exported knowledge package.

## Remaining activation gates

1. Review/build validation of the branch.
2. Apply the device migration only in an explicitly approved environment.
3. Pair a representative onboard machine and store the one-time credential securely.
4. Prove read-only Cloud→Boat sync first.
5. Separately grant `operating-log:write` and enable the deployment flag only for the Boat→Cloud acceptance test.
6. Verify revocation before considering the feature releasable.

Production/main remains untouched until explicit merge/deployment approval.
