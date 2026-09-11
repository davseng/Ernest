# Ernest v0.8 — Operate

## Release goal
Make Ernest the natural day-to-day interface to the boat while strengthening trust, evidence access, portability, and the foundation for v0.9 ingestion.

## Guardrails
- Verified facts only; never invent asset specifications or installed equipment.
- Conversation history is context, not verified evidence.
- AI suggestions never silently become trusted facts or durable records.
- Durable conversational changes require explicit confirmation.
- Production remains stable on `main`; all v0.8 work is Preview-tested before promotion.
- Do not run the legacy database seed.
- Preview and Production currently share the Neon database; tests must not destructively modify real records.
- Keep original documents and photos private.

## Scope

### 1. Persistent conversations
- Persist chats by owner and asset.
- New Chat creates a new conversation rather than clearing the only session.
- Add Recent Chats/history.
- Auto-title conversations from early content, with rename support if inexpensive.
- Reopen and continue prior conversations.
- Preserve the trust boundary: prior user/assistant conversation is context, not verified boat evidence.

### 2. Think Harder
- Add a simple `Think harder` control near the composer.
- Normal requests continue to use the economical default model.
- Think Harder applies only to the selected request and invokes the configured advanced model/reasoning path.
- Both paths use the same verified Ernest retrieval/context rules.
- Return to normal mode on the next request.
- Do not expose model-selection complexity in the primary UI.

### 3. Checklist CRUD through Ernest
- Conversationally create a checklist/procedure.
- Read/show existing checklists.
- Propose edits to title, notes, type, steps, and step ordering.
- Add/remove/reorder steps.
- Archive/delete with explicit confirmation.
- Every durable change is owner/asset scoped and requires confirmation.
- Source-backed procedures retain their provenance.

### 4. Full-screen checklist operating mode
- Dedicated mobile/tablet-friendly checklist runner.
- Large readable steps and touch targets.
- Show progress such as `7 of 12`.
- Clear/restart the run without changing the master checklist.
- Keep master checklist editing separate from running a checklist.
- Preserve emergency-procedure behavior: source-backed steps, no improvised authoritative emergency instructions.
- Persistent completion history is optional for v0.8 unless it falls out naturally from the implementation.

### 5. Simplify Equipment information architecture
- Rename `Equipment Knowledge` to `Equipment` in navigation and page language.
- Mental model: Equipment = what is installed on this boat.
- Inventory remains separate: what supplies/spares/items are aboard and where.
- Make manuals/documents/source evidence easy to see from an equipment record.
- Add equipment lifecycle foundation: `installed`, `removed/replaced`, `unknown` (exact schema may vary).
- Historical evidence about removed equipment must not cause Ernest to represent it as currently installed.

### 6. Original-document access and evidence links
- Keep Cloudflare R2 private.
- Generate owner/asset-authorized, short-lived signed read URLs for originals.
- Add `Open original` from Document Library/detail.
- Expose source documents from Equipment and other evidence views.
- Make Ernest document citations clickable to the original PDF when practical, preferably to the cited page.
- Never make the bucket public to achieve this.

### 7. Document Vault foundation
- Support multi-file/batch upload.
- Add a simple unprocessed/needs-review state suitable for future ingestion workflows.
- Do not require classification during capture/upload.
- Preserve original files.
- Prepare schema/UI for v0.9 `Empty the Box` without implementing manual matching/download or paper-disposition logic yet.

### 8. Photos as evidence — foundation
- Allow photos to be stored as private boat knowledge/evidence.
- Preserve the original image.
- Optional title/description.
- Allow confirmed association to equipment, systems, inventory, and/or other appropriate records.
- Make associated photos retrievable as evidence in Ernest where useful.
- Do not silently infer verified equipment/facts from an image.
- Automatic data-plate/equipment recognition is deferred to v0.9.

### 9. Maintenance from evidence — first step
- When a source document contains a clear maintenance event, Ernest may propose a maintenance/history record.
- Proposal must show source document/page and extracted evidence.
- User confirms before save.
- Do not infer manufacturer intervals or maintenance requirements that the source does not state.
- Respect equipment lifecycle so maintenance on old/replaced equipment does not establish current installation.

### 10. Backup / export
- Add an `Export <asset>` capability.
- Export original documents, photos, and structured Ernest data in a portable package.
- Include a human-readable organization/index plus machine-readable structured data where practical.
- Treat this as the first building block for future hybrid/local Ernest and local copies of key boat knowledge.
- Export must not weaken private storage or owner scoping.

## Explicitly deferred from v0.8
- Manual cover recognition and automatic manual download/matching.
- Full Paper-to-Ernest / `Empty the Box` workflow.
- Automatic splitting of bulk scanned PDFs.
- Automatic equipment identification from photos/data plates.
- Ship's Papers / legal paper-retention recommendations.
- Weather integration.
- Weather routing.
- Full local/offline AI runtime and synchronization.
- Crew/technician sharing and QR labels.
- Major auth redesign.

## Suggested implementation order
1. Small UX cleanup: Equipment rename + source/original access.
2. Persistent conversations + Recent Chats.
3. Think Harder.
4. Checklist CRUD + full-screen runner.
5. Document Vault batch/review foundation.
6. Photos as evidence.
7. Equipment lifecycle + maintenance-from-evidence proposals.
8. Backup/export.

Each slice should be independently Preview-testable. Prefer small commits/checkpoints over one large v0.8 change.

## Acceptance theme
At v0.8 completion an owner should be able to use Ernest as the primary operating interface: continue prior conversations, deliberately invoke deeper reasoning, manage and run checklists, inspect the original evidence behind answers, add documents/photos without excessive setup, safely capture maintenance evidence, and export the boat's knowledge.
