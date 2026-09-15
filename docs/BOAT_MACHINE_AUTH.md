# Boat machine authentication decision

## Why this exists

The onboard Ernest instance eventually needs unattended Cloud → Boat reads and Boat → Cloud operating-log uploads. The existing Auth.js browser session is intentionally not reused as a permanent machine credential.

## Required properties

Any approved credential must be asset-scoped, owner-issued, revocable, rotatable, stored only on the onboard machine, usable without an interactive browser session, and rejected for assets outside its scope. Server logs and UI must never expose the secret value. Losing the boat computer must not expose the owner's normal web-session credential.

## Recommended direction

Use a dedicated **boat device credential** rather than an API key copied from a user account. Enrollment should happen while the owner is signed in to cloud Ernest:

1. Owner chooses an asset and creates/enrolls an onboard Ernest device.
2. Cloud Ernest creates a device identity scoped to that asset and returns a one-time secret.
3. The onboard runtime stores the secret locally with restrictive filesystem permissions.
4. Sync requests authenticate as the device. The server resolves device → owner + asset before any package read or log write.
5. The owner can revoke the device from cloud Ernest without changing normal account credentials.
6. Rotation replaces the secret without changing the device identity or asset data.

The database should store only a cryptographic hash of the device secret, plus device ID, asset ID, owner ID, created/last-used/revoked timestamps and an optional label. The raw secret is shown only during enrollment.

## Authorization contract

A valid device credential is not general Ernest authentication. It authorizes only the offline-sync protocol for its assigned asset. It must not authorize the normal web UI, arbitrary database access, other assets, account changes, document administration, or model-provider credentials.

Cloud → Boat may be enabled before Boat → Cloud because it is read-only, but both should use the same eventual device identity. Boat → Cloud remains disabled until the credential implementation, revocation path, and upload safety tests are reviewed and explicitly approved.

## Alternatives not selected

Long-lived Auth.js session cookies couple unattended sync to interactive login and have too much account scope. A single account-wide API key has unnecessarily broad blast radius. Network/VPN identity alone does not prove which Ernest asset/device is making the request.

## Implementation gate

This document records the recommended architecture only. It does not create a credential table, migration, secret, environment value, or enabled cloud write path. Those changes require explicit owner approval before implementation/activation.
