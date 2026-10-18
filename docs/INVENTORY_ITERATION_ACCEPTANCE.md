# Inventory, locations and reliable confirmation

Scope: next iteration on top of v0.11 and Preview cookie isolation. Production/main and draft PR #23 remain unchanged. Owner confirmed that uploading to Preview did not add a document to Production; the uploaded inventory spreadsheet was subsequently deleted from Preview. No inventory or location facts from that deleted spreadsheet are imported or fabricated by this change.

## Resulting behavior

- Owner-scoped inventory is always available to reasoning, rather than gated by trigger words. Inventories of up to 40 items are supplied in full; larger inventories select up to 40 matching entries and disclose the total/excerpt counts. Saved location labels and explicit current owner-confirmed code definitions resolve questions such as Port Settee to the recorded codes. An undefined AH/LZ1 code is never expanded from letters or contents.
- Missing inventory entries mean not recorded, not proof that an item is absent aboard. Historical document inventory stays historical. Explicit owner statements of absence and exact existing-code definitions can generate knowledge cards, still requiring confirmation.
- A narrow deterministic path turns an unambiguous statement such as "I have 4 fuel filters" into an actual inventory proposal. Ambiguous matches, questions and uncertain/hypothetical text are not deterministically converted. Other phrasing continues through the model classifier. Numeric and nested model outputs are normalized, identifiers checked against owner-controlled records, and inventory JSON formats are explicit.
- Both full chat and the smaller Ask panel render executable cards. Inventory cards display item, recorded location, old and new quantity. Confirm & save executes the server action; typing confirmed can execute an existing pending real chat card. A plain assistant-written confirmation is not a save. Success reports the actual quantity after the database transaction. Subsequent context includes actual save outcomes.
- Quantity writes lock the owned item and compare its quantity with the proposal snapshot. Stale proposals fail rather than overwrite a newer quantity. Invalid quantities are rejected before any field mutation; missing-location errors roll back the whole transaction. Old pre-iteration proposals without snapshots retain their former compatibility behavior; request a new card for stale old conversations.
- Diagram lookup can attach an owner-scoped original PDF even if no text was extracted from its diagram pages. It considers diagram/layout/storage/inventory titles, preserves the two-file/12 MiB-per-file limits, reports missing originals and keeps interpretations unverified. Follow-ups retain their retrieval subject. This improves access to evidence; it does not prove the provider correctly reads any specific boat diagram.
- Evidence rendering removes malformed/empty entries and duplicates, supplies readable fallback labels, and links attached originals separately from numbered extracted pages. Retrieved evidence lists context supplied, not proof that every entry supports every claim; source accuracy still needs the owner test.

## Automated validation

- Lint passed with the same two existing warnings.
- TypeScript passed.
- All 92 unit/integration tests passed with zero failures or skips.
- Production build and git diff --check passed.
- `npm run test:inventory-browser` passed in real Chromium against an isolated synthetic PGlite database. It renders the actual React chat/card/Ask components, invokes the actual ask/proposal/confirmation/inventory code, and checks no pre-confirmation mutation, click-save persistence after refresh, saved location context, a failed save retaining the old quantity, typed confirmation on a pending card, and smaller-Ask-panel saves.

The browser harness injects authentication, model and external-service boundaries. It does not send mail, use an auth bypass in the application, contact Neon, read R2/Drive or verify real model judgment. It serves loopback only, uses synthetic records, and closes its own browser/server/database. No real credential or private record is recorded. For reproduction: Node 24, npm install, and either trusted system Chromium (auto-detected), ERNEST_CHROMIUM_PATH, or npx playwright install chromium. Playwright is pinned in devDependencies. CI installs Chromium and runs the browser command separately from the unit suite.

## Owner acceptance on the fixed Preview website

Use the new Preview commit once Vercel says Ready. No new database migration is required for this iteration; test Neon already has 025.

1. Ask about fuel filters without saying "look in Inventory". It should use recorded quantities/locations and not substitute an older document.
2. State the correct filter quantity. The real card must identify Racor Fuel Filters/LZ1 and show the requested quantity. Confirm once, refresh Inventory, and verify the quantity. Do not use an invented quantity on Production; Preview is isolated.
3. If a relevant recorded location code exists, state its true name (for example AH is the aft head only if accurate), confirm the knowledge card, then ask for items under that named location in a new chat. Do not assert a Port Settee mapping that is not known.
4. State a true absence, such as no sextant aboard, confirm once, and ask again. The answer must distinguish confirmed absence from an incomplete inventory and preserve historical source documents.
5. Optionally upload an owner-approved diagram to the test bucket and ask for sections and exact page evidence. The deleted inventory spreadsheet is no longer available; Ernest must not pretend to see it. Unknown labels/relationships must stay uncertain. Check readable evidence links.

Record these as passed/failed/unrun. Live model/provider behavior, deployed build and owner browser acceptance are not established by local tests.

## Production release gate

The owner requested release as soon as tested. Do not equate local synthetic checks with live acceptance or promote an unverified deployment. After Preview owner acceptance passes, prepare a production release covering all v0.11 code, this iteration and the Preview-cookie fix. Keep PR #23 unmerged until a reviewed release decision resolves which PR carries the final code. A draft from the preview branch may collect the full tested release without pushing feature branches that inherit shared production credentials.

Production still requires its own read-only schema preflight and a recovery point. Migration 025 was applied only to the test branch; its ledger is not production evidence. Provide a separately reviewed production SQL Editor rollout after the release gate, not the test-branch-only script relabeled as production-safe. Do not run the general historical migrator, replay 022, copy Preview records/blobs into production, seed, or migrate credentials. The owner retains SQL Editor execution; no production credentials are requested for Codex. Releasing code does not transfer Preview test data. Never merge or deploy production while required acceptance/schema evidence is missing.

## Follow-up to failed owner acceptance

The owner reported the exact correction "There are 4 engine filters. Can you please update?" reached a prose answer claiming a save and adding an unsupported Yanmar-secondary-filter interpretation. Acceptance failed; do not release to Production on the previous results. The narrow quantity parser now accepts "There are", matches the existing Engine Fuel Filters entry separately from Racor, and returns a real card. Explicit write requests rejected by the classifier stop before the read-only answer model. A read-only answer guard also suppresses first-person/bare completion claims without a write result. This is an application-level mutation routing guard, not merely another model instruction. No owner inventory was edited by Codex.

The owner also reported the generic document page error. A synthetic existing-schema test reproduces an optional-maintenance-query failure and verifies the actual document page still renders the original link/text after this fix. Optional enrichment loads independently, emits a visible unavailable warning and sanitized error code, and disables maintenance generation when its inputs cannot load. Primary authentication, ownership, document and extracted-page queries still fail normally rather than hiding access failures. This does not establish which exception occurred on the live deployment; the owner must reopen the actual document, and any remaining error/unavailable section needs targeted diagnosis rather than historical migration replay.

Updated local validation: all 98 tests passed, including six feedback regressions and server rendering of the actual document page; real Chromium acceptance now uses the exact owner wording with separate Engine and Racor entries and initially unknown quantities. It verifies no write before confirmation, Engine quantity persisted after confirmation/refresh and Racor remains unchanged. Lint (two existing warnings), typecheck, build and diff checks passed. Live owner acceptance is pending again. No production change, database migration or merge to main occurred.
