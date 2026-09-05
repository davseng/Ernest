# Ernest working rules

This repository has a manually verified recovery baseline. Treat it as a working product, not a blank-slate prototype.

## Current verified baseline

The recovery branch `recovery/verified-baseline` was created from the manually tested identifier recovery state. The following flows have been manually verified against the real application/database:

- passwordless sign-in
- owner-scoped asset loading
- operating log create/persist
- asset editing
- system add/edit/delete
- component add/edit/delete
- asset registration/VIN editing
- component serial-number editing

Preserve these behaviors unless a task explicitly changes one of them.

## Data integrity

Ernest follows a verified-facts-only rule.

- Never invent asset, system, component, equipment, manufacturer, model, location, serial, maintenance, or operating facts.
- Do not overwrite existing real data with examples, placeholders, or demo content.
- Do not run the seed against production or shared Preview/Production data.
- `scripts/seed.mjs` is not a safe source of truth for Far Better and must not be used to repopulate live data.

## Ownership and auth

All private data access is owner-scoped.

- Derive owner identity from the authenticated server session only.
- Never accept `owner_id` or equivalent ownership identity from browser form input.
- Reads and mutations for assets, systems, components, and logs must constrain access through the authenticated owner's asset.
- Unauthorized or unavailable records should fail safely as not found or redirect to sign-in, consistent with existing patterns.
- Do not change Auth.js configuration, session behavior, email sign-in, or adapter schema unless the task explicitly requires it and the change is separately tested.

## Database and migrations

Production and Vercel Preview currently use the same Neon database. Treat every database write or migration as production-impacting.

- Never run migrations automatically from development or recovery work.
- Never run `npm run db:seed` against the shared database.
- Prefer forward-only additive migrations.
- Before applying a migration manually, verify whether the schema change already exists.
- Preserve prior migrations; do not rewrite migration history to make a new change appear older.
- Migration `006_asset_identifiers.sql` is intentionally safe to re-run after the identifier columns were added manually.

## Change discipline

Work in small, independently testable slices.

- Start from the exact requested Git commit or branch. If that state is unavailable locally, stop rather than silently implementing from a different tree.
- One feature per branch.
- Avoid unrelated refactors while restoring or extending behavior.
- Do not broaden scope into asset creation/deletion, auth changes, schema changes, or AI features unless explicitly requested.
- Keep component/system deletion safeguards because system deletion can cascade to components.

## Required checks

For code changes, run all available checks before declaring the implementation complete:

```bash
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

If any cannot be run, say exactly which were not run and why. Never claim they passed based only on code inspection.

## Manual verification

A successful build is not the final gate for user-facing changes. Use a Vercel Preview and manually exercise the exact changed behavior with temporary/non-destructive data. Restore temporary values after testing when the Preview shares the production database.

## Recovery safety

Do not merge recovery work to `main` without explicit user approval. The manually verified recovery branches are checkpoints and should remain usable as rollback points.
