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

Production and generic Vercel Preview defaults can share production services. Only the Git branch `preview` has owner-configured isolated Neon/R2 overrides. Do not assume other feature deployments are isolated; a feature-branch push can create a deployment using inherited production bindings. The owner runs SQL in Neon SQL Editor; never request production credentials. Treat every unverified database target as production-impacting.

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

## v0.12 simplified review workflow

The active chat uses one evidence-aware planner (`src/data/review-planner.ts`), not the legacy intent classifier or wording-specific inventory parsers. Both advice and proposed updates see records/history and owner-scoped read tools. Model tools cannot approve, save or delete definitive records. Preserve the shared Ernest voice while keeping instructions in source evidence untrusted.

User-approved review forms are the only new write path. `update_reviews` stores pending forms and exactly-once receipts; `maintenance_events` stores nullable work dates/hours and linked spare use; `survey_items` stores approved A/B findings/statuses; `update_audit` retains before/after changes. Existing Neon/R2 records and originals are preserved. Markdown-style Boat Knowledge is generated from records, never independently edited as a competing truth. Older maintenance log entries remain visible and are not silently duplicated or converted.

Save selected related changes in one transaction, derive owner from the authenticated session, lock owned records and compare captured revisions/stock. Reject stale updates and duplicates unless explicitly reviewed. A repeated saved review returns its original receipt. Unknown work dates are not upload/invoice dates; unknown stock is not zero. Corrections do not consume the same spare again. Missing optional fields must not block recording known work. Provide a blank form that does not depend on the provider.

Document processing may extract historical evidence but may not automatically resolve/supersede findings. Full survey coverage cannot be inferred from selected/truncated pages; the owner can explicitly confirm completeness. Preserve identifiers, original wording, page references and all unresolved findings. “Repair documented” differs from owner-confirmed resolution. Existing legacy helpers/proposal snapshots remain for compatibility; do not route new chat updates through them.

Migration 026 is a separate owner-run additive rollout. Do not deploy this version over the fixed Preview until its isolated schema is verified. SQL scripts are in scripts/v012/sql-editor. Never replay 022 or a complete historical migration sequence. No automatic migrations in install/build/start, no seed, no new services or secret values in output. Production requires a separately approved rollout.

Run lint, typecheck, the full unit/integration suite, `npm run test:review-browser`, build and diff checks. The browser harness uses the actual React/forms/actions/store against synthetic PGlite data with injected session/provider boundaries; it is not live Neon/R2/email/model acceptance. Live owner acceptance must exercise the impeller/spare example, date correction, survey reconciliation and readable history on the isolated Preview.
