# Slice 9 — Unified UX + Ernest as the Interface

## Goal
Make Ernest feel like one coherent iPad-first application. Chat is the primary operating interface; Manage screens are for browsing, review, setup, and administration.

## Acceptance requirements

### 1. One asset header everywhere
- Shared responsive header on authenticated asset pages.
- Ernest/Chat returns to the selected asset chat in one tap.
- Asset context is visible.
- Same Manage menu everywhere: Equipment, Inventory, Procedures & checklists, Documents, Photos, Asset setup, Download backup.
- Remove legacy page-specific horizontal navigation.

### 2. iPad interaction baseline
- Normal interactive targets at least 44px tall where practical.
- Avoid tiny inline edit/delete controls as the primary interaction.
- Edit flows use focused, readable editors with clear Save/Cancel hierarchy.
- Destructive actions are separated from normal changes and explicitly confirmed.
- Every durable mutation gives visible in-progress and completion/error feedback.

### 3. Equipment usability
- Default Equipment screen prioritizes browsing the registry.
- Search/filter equipment and lifecycle without scrolling through discovery/review tooling.
- Installed is the normal view; removed/replaced and unknown remain easy to inspect.
- Equipment rows/cards show concise identity, system, lifecycle, and evidence state.
- Editing one component is focused rather than exposing many nested forms at once.
- Discovery/candidate review is secondary but pending review remains visible.

### 4. Ernest conversational control
- Equipment detail corrections can be proposed from chat.
- Equipment lifecycle changes can be proposed from chat.
- Checklist/procedure changes can be proposed from chat.
- All durable conversational changes follow proposal → explicit confirmation → write.
- Conversation context is not promoted to verified knowledge merely because it appeared in chat.

### 5. Site-wide hierarchy cleanup
- Common page pattern: title, concise purpose, primary action, content.
- Preserve provenance/trust information without forcing repeated implementation explanations into the primary workflow.
- Chat, Equipment, Inventory, Procedures, Documents, Photos, and Asset Setup receive responsive review.

## Guardrails
- No silent AI writes.
- No invented equipment/specifications/procedures.
- No destructive tests against real Far Better records.
- Preview and Production share Neon; test only reversible changes or temporary records.
- Do not run the legacy seed.
- Preserve private R2 originals and owner scoping.

## Release gate
Slice 9 must pass iPad-oriented Preview acceptance and an end-to-end regression before the v0.8 PR is merged to production.
