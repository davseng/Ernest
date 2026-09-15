# Boat sync authentication decision record — proposed

Status: **design only; not activated**.

## Problem

The onboard Ernest process must eventually synchronize Far Better without an interactive browser sign-in. Reusing the owner's Auth.js browser cookie would be fragile and grants the appliance the wrong kind of authority.

## Recommended model

Use a dedicated **asset-scoped boat credential** issued by cloud Ernest after an authenticated owner explicitly pairs an onboard instance.

Properties:
- random high-entropy secret generated once;
- cloud stores only a one-way hash;
- credential record is tied to one owner and one asset;
- explicit scopes, initially `snapshot:read` and later separately `operating-log:write`;
- revocable without changing the owner's login;
- created/last-used/revoked timestamps for auditability;
- secret shown only at pairing and stored only on the onboard computer;
- normal owner Auth.js sessions remain unchanged.

## Pairing flow

1. Owner signs into cloud Ernest normally.
2. Owner opens Far Better → Offline/Onboard and chooses Pair onboard Ernest.
3. Cloud creates a credential with read-only scope first.
4. Secret is transferred once to the onboard instance and stored in an OS-protected configuration location.
5. Boat sends `Authorization: Bearer <secret>` to the offline-sync API.
6. Cloud hashes the presented secret, resolves credential → owner/asset/scopes, and rejects mismatched asset IDs.
7. Owner can revoke the boat credential from cloud Ernest.

Boat→Cloud operating-log scope should be a separate explicit capability. Enabling that scope is distinct from the existing deployment flag; both must permit the write before cloud mutation occurs.

## Why this model

It avoids storing a personal browser session on an unattended appliance, limits compromise to one asset and declared capabilities, supports revocation, and works after long disconnected periods without requiring the owner to be present when connectivity returns.

## API behavior

Machine endpoints should always return JSON, never sign-in redirects:
- `401` missing/invalid credential;
- `403` valid credential but missing scope or wrong asset;
- `200` current/update for snapshot reads;
- Boat→Cloud remains `503 uploadEnabled:false` while the deployment-level write flag is off.

## Deferred implementation

Do not add a credential table/migration or modify Auth.js in Slice D without explicit approval. The current branch can complete transport boundaries, local persistence, UI/status, and hardware packaging independently of this decision.
