# Ernest v0.4 — Document Intelligence

## Goal

Turn uploaded documents into trustworthy asset knowledge instead of treating them only as bags of searchable text.

The acceptance document is the real two-page, image/table-based Far Better maintenance log. v0.4 is successful when Ernest can ingest it and answer maintenance-history questions with page provenance without inventing manufacturer guidance.

## Pipeline

1. **Extract** embedded PDF text while preserving page provenance.
2. **Assess extraction quality** per page. Weak or image-only pages are candidates for OCR rather than being silently treated as empty.
3. **OCR / layout understanding** for weak pages, preserving page number and useful table/row relationships.
4. **Interpret** extracted content into document-derived knowledge candidates. Candidates are evidence, not automatically trusted asset facts.
5. **Review / promote** candidates only with owner approval when they should become durable structured asset knowledge.
6. **Retrieve** from structured trusted knowledge and supporting document evidence together.

## Provenance rules

- Owner-verified structured facts remain the strongest statement of current asset configuration.
- Manufacturer documentation is authoritative only for an identified matching product/model.
- Maintenance/service records describe recorded events and history; they do not establish manufacturer service intervals unless the source explicitly says so.
- Survey, purchase, and listing material remains source-derived evidence and may be historical or incorrect.
- AI interpretation/inference never silently becomes a verified fact.
- Every document-derived candidate must retain document and page provenance.

## First acceptance questions

Using the maintenance log alone, Ernest should be able to answer:

- What is the raw-water impeller part number?
- When was the impeller last changed?
- When was the last engine oil change?
- What oil and filter were recorded?
- Show the oil-change history.
- Roughly how many engine hours occurred between historical oil changes?

For the final question, Ernest must label the result as calculated from recorded history, not a manufacturer-recommended interval.

## Delivery slices

### Slice A — extraction quality

- Preserve richer text layout than the current global whitespace collapse where practical.
- Score/detect pages with little or no usable embedded text.
- Expose extraction method/quality in document inspection.
- Add OCR fallback for weak/image-only pages while preserving page provenance.

### Slice B — structured maintenance candidates

- Extract candidate maintenance events: date, engine hours, service/action, parts/consumables, notes, source document/page.
- Keep candidates separate from verified structured records.
- Show candidates for owner review.

### Slice C — promotion and retrieval

- Allow explicit owner approval of appropriate candidates.
- Preserve source/provenance when promoted.
- Let Ernest retrieve structured knowledge plus supporting source pages.

## Deferred

- Automatic unsupervised promotion of document facts.
- General-purpose OCR for every possible document/layout before the maintenance-log case works well.
- Replacing source documents with AI summaries.
- Treating historical patterns as manufacturer specifications.
