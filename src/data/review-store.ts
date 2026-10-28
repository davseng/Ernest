import type { Sql } from "postgres";
import { createHash } from "node:crypto";
import {
  parseDraft,
  type ReviewDraft,
  type ReviewRow,
  type Receipt,
  type Evidence,
} from "../domain/review";
import { createKnowledgeStore } from "./knowledge-store";

type Pins = {
  inventory: Record<string, string | null>;
  events: Record<string, number>;
  survey: Record<string, number>;
  knowledge: Record<string, string>;
};
export type StoredDraft = ReviewDraft & { pins: Pins };
export type Review = {
  id: string;
  request: string;
  draft: StoredDraft;
  status: "pending" | "saved" | "cancelled";
  receipt: Receipt | null;
  created_at: Date;
};
export type MaintenanceEvent = {
  id: string;
  title: string;
  description: string;
  occurred_on: string | null;
  component_id: string | null;
  engine_hours: string | null;
  spare_item_id: string | null;
  spare_used: string | null;
  evidence: Evidence[];
  revision: number;
  approved_at: Date;
};
export type SurveyItem = {
  id: string;
  document_id: string;
  identifier: string;
  priority: "A" | "B";
  wording: string;
  page_number: number;
  status: string;
  notes: string;
  evidence: Evidence[];
  revision: number;
};
const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const fingerprint = (s: string) =>
  createHash("sha256").update(normalized(s)).digest("hex");
const key = (doc: string, id: string) => `${doc}:${id}`;
export function createReviewStore(sql: Sql) {
  async function owned(assetId: string, ownerId: string) {
    return (
      (
        await sql`SELECT id FROM assets WHERE id=${assetId} AND owner_id=${ownerId}`
      ).length === 1
    );
  }
  async function events(assetId: string, ownerId: string) {
    return sql<
      MaintenanceEvent[]
    >`SELECT m.id,m.title,m.description,m.occurred_on::text,m.component_id,m.engine_hours::text,m.spare_item_id,m.spare_used::text,m.evidence,m.revision,m.approved_at FROM maintenance_events m JOIN assets a ON a.id=m.asset_id WHERE m.asset_id=${assetId} AND m.owner_id=${ownerId} AND a.owner_id=${ownerId} ORDER BY m.occurred_on DESC NULLS LAST,m.approved_at DESC`;
  }
  async function survey(assetId: string, ownerId: string) {
    return sql<
      SurveyItem[]
    >`SELECT s.id,s.document_id,s.identifier,s.priority,s.wording,s.page_number,s.status,s.notes,s.evidence,s.revision FROM survey_items s JOIN assets a ON a.id=s.asset_id WHERE s.asset_id=${assetId} AND s.owner_id=${ownerId} AND a.owner_id=${ownerId} ORDER BY s.document_id,s.priority,s.identifier`;
  }
  return {
    events,
    survey,
    async available() {
      try {
        return (
          (
            await sql`SELECT to_regclass('public.update_reviews') IS NOT NULL AND to_regclass('public.maintenance_events') IS NOT NULL AND to_regclass('public.survey_items') IS NOT NULL AND to_regclass('public.update_audit') IS NOT NULL AS ready`
          )[0]?.ready === true
        );
      } catch {
        return false;
      }
    },
    async create(
      assetId: string,
      ownerId: string,
      request: string,
      input: unknown,
      snapshot?: {
        inventory: Array<{ id: string; quantity: string | null }>;
        maintenance: Array<{ id: string; revision: number }>;
        survey: Array<{
          document_id: string;
          identifier: string;
          revision: number;
        }>;
        knowledge: Array<{
          id: string;
          subject: string;
          predicate: string;
          supersededBy?: string | null;
          kind?: string;
        }>;
      },
    ) {
      if (!(await owned(assetId, ownerId))) throw Error("Asset not found.");
      const draft = parseDraft(input);
      const [i, e, s, k] = snapshot
        ? [
            snapshot.inventory,
            snapshot.maintenance,
            snapshot.survey,
            snapshot.knowledge.filter(
              (x) => !x.supersededBy && x.kind !== "observation",
            ),
          ]
        : await Promise.all([
            sql<
              { id: string; quantity: string | null }[]
            >`SELECT id,quantity::text FROM inventory_items WHERE asset_id=${assetId} AND owner_id=${ownerId}`,
            events(assetId, ownerId),
            survey(assetId, ownerId),
            sql<
              { id: string; subject: string; predicate: string }[]
            >`SELECT id,subject,predicate FROM owner_knowledge WHERE asset_id=${assetId} AND owner_id=${ownerId} AND superseded_by IS NULL AND kind<>'observation'`,
          ]);
      const pins: Pins = {
        inventory: Object.fromEntries(i.map((x) => [x.id, x.quantity])),
        events: Object.fromEntries(e.map((x) => [x.id, x.revision])),
        survey: Object.fromEntries(
          s.map((x) => [key(x.document_id, x.identifier), x.revision]),
        ),
        knowledge: Object.fromEntries(
          k.map((x) => [
            key(normalized(x.subject), normalized(x.predicate)),
            x.id,
          ]),
        ),
      };
      const stored = { ...draft, pins };
      const rows = await sql<
        { id: string }[]
      >`INSERT INTO update_reviews(asset_id,owner_id,request,draft) VALUES(${assetId},${ownerId},${request.slice(0, 6000)},${JSON.stringify(stored)}::jsonb) RETURNING id`;
      return rows[0].id;
    },
    async get(assetId: string, ownerId: string, id: string) {
      const r = await sql<
        Review[]
      >`SELECT r.id,r.request,r.draft,r.status,r.receipt,r.created_at FROM update_reviews r JOIN assets a ON a.id=r.asset_id WHERE r.id=${id} AND r.asset_id=${assetId} AND r.owner_id=${ownerId} AND a.owner_id=${ownerId}`;
      return r[0] ?? null;
    },
    async pending(assetId: string, ownerId: string) {
      return sql<
        { id: string; request: string; created_at: Date }[]
      >`SELECT r.id,r.request,r.created_at FROM update_reviews r JOIN assets a ON a.id=r.asset_id WHERE r.asset_id=${assetId} AND r.owner_id=${ownerId} AND a.owner_id=${ownerId} AND r.status='pending' ORDER BY r.created_at DESC LIMIT 30`;
    },
    async coverage(assetId: string, ownerId: string) {
      return sql<
        { receipt: Receipt }[]
      >`SELECT r.receipt FROM update_reviews r JOIN assets a ON a.id=r.asset_id WHERE r.asset_id=${assetId} AND r.owner_id=${ownerId} AND a.owner_id=${ownerId} AND r.status='saved' AND r.receipt->'coverage'->>'confirmed'='true' ORDER BY r.saved_at DESC LIMIT 100`;
    },
    async auditForReview(assetId: string, ownerId: string, reviewId: string) {
      const rows = await sql<
        {
          id: string;
          review_id: string;
          changes: unknown[];
          created_at: Date;
        }[]
      >`SELECT h.id,h.review_id,h.changes,h.created_at FROM update_audit h JOIN assets a ON a.id=h.asset_id WHERE h.asset_id=${assetId} AND h.owner_id=${ownerId} AND a.owner_id=${ownerId} AND h.review_id=${reviewId}`;
      return rows[0] ?? null;
    },
    async audit(assetId: string, ownerId: string) {
      return sql<
        {
          id: string;
          review_id: string;
          changes: unknown[];
          created_at: Date;
        }[]
      >`SELECT h.id,h.review_id,h.changes,h.created_at FROM update_audit h JOIN assets a ON a.id=h.asset_id WHERE h.asset_id=${assetId} AND h.owner_id=${ownerId} AND a.owner_id=${ownerId} ORDER BY h.created_at DESC LIMIT 100`;
    },
    async cancel(assetId: string, ownerId: string, id: string) {
      return (
        (
          await sql`UPDATE update_reviews r SET status='cancelled' FROM assets a WHERE r.id=${id} AND r.asset_id=${assetId} AND r.owner_id=${ownerId} AND a.id=r.asset_id AND a.owner_id=${ownerId} AND r.status='pending' RETURNING r.id`
        ).length === 1
      );
    },
    async approve(
      assetId: string,
      ownerId: string,
      id: string,
      input: unknown,
      coverageConfirmed = false,
    ): Promise<Receipt> {
      return sql.begin(async (tx) => {
        if (
          (
            await tx`SELECT id FROM assets WHERE id=${assetId} AND owner_id=${ownerId} FOR UPDATE`
          ).length !== 1
        )
          throw Error("Asset not found.");
        const reviews = await tx<
          Review[]
        >`SELECT id,request,draft,status,receipt FROM update_reviews WHERE id=${id} AND asset_id=${assetId} AND owner_id=${ownerId} FOR UPDATE`;
        const review = reviews[0];
        if (!review) throw Error("Update not found.");
        if (review.status === "saved" && review.receipt) return review.receipt;
        if (review.status !== "pending")
          throw Error("This update has been cancelled.");
        const submitted =
          input && typeof input === "object"
            ? (input as Record<string, unknown>)
            : {};
        const draft = parseDraft({
          ...review.draft,
          ...submitted,
          rows: Array.isArray(submitted.rows)
            ? submitted.rows.filter(
                (r) =>
                  r &&
                  typeof r === "object" &&
                  (r as Record<string, unknown>).include !== false,
              )
            : [],
        });
        if (!draft.rows.length)
          throw Error("Choose at least one change to save.");
        if (
          coverageConfirmed &&
          review.draft.rows.some(
            (r) =>
              r.kind === "survey" && !draft.rows.some((s) => s.id === r.id),
          )
        )
          throw Error(
            "Survey items were excluded. Leave complete-list confirmation unchecked for a partial review.",
          );
        const ids = new Set(review.draft.rows.map((r) => r.id));
        if (
          draft.rows.some(
            (r) =>
              !ids.has(r.id) ||
              review.draft.rows.find((x) => x.id === r.id)?.kind !== r.kind,
          )
        )
          throw Error(
            "This form does not match its saved draft. Prepare a new update.",
          );
        const audit: Array<{
          kind: string;
          recordId: string;
          before: unknown;
          after: unknown;
        }> = [];
        const receipt: Receipt = {
          reviewId: id,
          message: "Saved the selected changes you approved.",
          changes: [],
        };
        const inventoryTouched = new Map<string, "deduction" | "absolute">();
        async function evidenceCheck(evidence: Evidence[]) {
          for (const source of evidence) {
            const docs =
              await tx`SELECT d.id FROM documents d JOIN assets a ON a.id=d.asset_id WHERE d.id=${source.documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId} AND (EXISTS(SELECT 1 FROM document_pages p WHERE p.document_id=d.id AND p.page_number=${source.pageNumber}) OR d.page_count>=${source.pageNumber})`;
            if (docs.length !== 1)
              throw Error(
                "An evidence document or page is no longer available to this owner.",
              );
          }
        }
        async function inventoryLock(
          itemId: string,
          mutates = true,
          mode: "deduction" | "absolute" = "absolute",
        ) {
          const previousMode = inventoryTouched.get(itemId);
          if (
            mutates &&
            previousMode &&
            (previousMode === "absolute" || mode === "absolute")
          )
            throw Error(
              "Do not combine an absolute stock adjustment and deductions for the same item. Record consumption without deduction when setting a verified balance.",
            );
          if (mutates) inventoryTouched.set(itemId, mode);
          if (!Object.hasOwn(review.draft.pins.inventory, itemId))
            throw Error(
              "Inventory item was not in the draft context. Prepare a new update.",
            );
          const rows = await tx<
            {
              id: string;
              name: string;
              quantity: string | null;
              details: string | null;
            }[]
          >`SELECT id,name,quantity::text,details FROM inventory_items WHERE id=${itemId} AND asset_id=${assetId} AND owner_id=${ownerId} FOR UPDATE`;
          const item = rows[0];
          if (!item) throw Error("Inventory item not found.");
          const expected = review.draft.pins.inventory[itemId];
          if (mutates && !previousMode && item.quantity !== expected)
            throw Error(
              `${item.name} changed since this form was prepared. Prepare a fresh update.`,
            );
          return item;
        }
        for (const row of draft.rows) {
          await evidenceCheck(row.evidence);
          if (row.kind === "maintenance") {
            if (!row.title || !row.description)
              throw Error(
                "Maintenance needs a title and a description of the work.",
              );
            if (row.date && row.date > new Date().toISOString().slice(0, 10))
              throw Error("Completed maintenance cannot have a future date.");
            if (
              row.componentId &&
              (
                await tx`SELECT c.id FROM components c JOIN systems s ON s.id=c.system_id JOIN assets a ON a.id=s.asset_id WHERE c.id=${row.componentId} AND a.id=${assetId} AND a.owner_id=${ownerId}`
              ).length !== 1
            )
              throw Error(
                "Choose equipment from this asset, or leave it unassigned.",
              );
            const eventFingerprint = fingerprint(
              [
                review.request,
                row.title,
                row.date ?? "",
                row.componentId ?? "",
                row.description,
              ].join("\n"),
            );
            let before: unknown = null;
            let eventId = row.eventId;
            if (eventId) {
              const rows = await tx<
                MaintenanceEvent[]
              >`SELECT * FROM maintenance_events WHERE id=${eventId} AND asset_id=${assetId} AND owner_id=${ownerId} FOR UPDATE`;
              if (
                !rows[0] ||
                rows[0].revision !== review.draft.pins.events[eventId]
              )
                throw Error(
                  "The maintenance event changed. Prepare a fresh correction.",
                );
              before = rows[0];
              // Corrections never consume the same spare a second time. Record any new
              // inventory adjustment as its own explicit inventory row in the same form.
              if (row.deductSpare)
                throw Error(
                  "A correction cannot consume a spare again. Use an explicit inventory adjustment.",
                );
            } else {
              const duplicates =
                await tx`SELECT id FROM maintenance_events WHERE asset_id=${assetId} AND owner_id=${ownerId} AND (request_fingerprint=${eventFingerprint} OR (occurred_on IS NOT DISTINCT FROM ${row.date}::date AND component_id IS NOT DISTINCT FROM ${row.componentId}::text AND lower(title)=lower(${row.title})))`;
              const legacy = row.date
                ? await tx`SELECT id FROM log_entries WHERE asset_id=${assetId} AND entry_type='maintenance' AND occurred_at::date=${row.date}::date AND lower(title)=lower(${row.title})`
                : [];
              if ((duplicates.length || legacy.length) && !row.allowDuplicate)
                throw Error(
                  "A matching maintenance event already exists. Correct it, or explicitly confirm this is a separate event.",
                );
            }
            if (row.spareItemId) {
              // Lock/check even when recording unknown balance without deducting.
              const item = await inventoryLock(
                row.spareItemId,
                row.deductSpare,
                "deduction",
              );
              if (row.deductSpare && !row.spareUsed)
                throw Error(
                  "Enter how many spares were used before deducting stock, or turn deduction off.",
                );
              if (row.deductSpare) {
                if (item.quantity === null)
                  throw Error(
                    "The spare balance is unknown. Record consumption without deduction, or supply a verified balance separately.",
                  );
                const updated = await tx<
                  { quantity: string }[]
                >`UPDATE inventory_items SET quantity=quantity-${row.spareUsed}::numeric,updated_at=now() WHERE id=${item.id} AND quantity>=${row.spareUsed}::numeric RETURNING quantity::text`;
                if (!updated.length)
                  throw Error("Not enough recorded spares for this deduction.");
                audit.push({
                  kind: "inventory",
                  recordId: item.id,
                  before: item,
                  after: { quantity: updated[0].quantity },
                });
                receipt.changes.push({
                  kind: "inventory",
                  recordId: item.id,
                  description: `${item.name}: remaining quantity ${updated[0].quantity}`,
                });
              } else
                receipt.changes.push({
                  kind: "consumption",
                  recordId: item.id,
                  description: `Recorded ${row.spareUsed ?? "an unknown number of"} ${item.name} used; inventory balance unchanged${item.quantity === null ? " (unknown)" : ""}.`,
                });
            } else if (row.deductSpare || row.spareUsed)
              throw Error("Choose the spare item to record consumption.");
            if (eventId) {
              await tx`UPDATE maintenance_events SET occurred_on=${row.date},title=${row.title},description=${row.description},component_id=${row.componentId},engine_hours=${row.engineHours},spare_item_id=${row.spareItemId},spare_used=${row.spareUsed},evidence=${JSON.stringify(row.evidence)}::jsonb,revision=revision+1,approved_at=now() WHERE id=${eventId} AND asset_id=${assetId} AND owner_id=${ownerId}`;
            } else {
              const inserted = await tx<
                { id: string }[]
              >`INSERT INTO maintenance_events(asset_id,owner_id,occurred_on,title,description,component_id,engine_hours,spare_item_id,spare_used,evidence,request_fingerprint) VALUES(${assetId},${ownerId},${row.date},${row.title},${row.description},${row.componentId},${row.engineHours},${row.spareItemId},${row.spareUsed},${JSON.stringify(row.evidence)}::jsonb,${eventFingerprint}) RETURNING id`;
              eventId = inserted[0].id;
            }
            audit.push({
              kind: row.kind,
              recordId: eventId,
              before,
              after: row,
            });
            receipt.changes.push({
              kind: row.kind,
              recordId: eventId,
              description: `${row.eventId ? "Corrected" : "Recorded"} ${row.title} — ${row.date ?? "work date unknown"}`,
            });
          } else if (row.kind === "inventory") {
            const item = await inventoryLock(row.itemId);
            if (row.quantity === null && row.details === null)
              throw Error("Enter a quantity or inventory detail.");
            await tx`UPDATE inventory_items SET quantity=CASE WHEN ${row.quantity}::numeric IS NULL THEN quantity ELSE ${row.quantity}::numeric END,details=CASE WHEN ${row.details}::text IS NULL THEN details ELSE ${row.details} END,updated_at=now() WHERE id=${item.id}`;
            audit.push({
              kind: row.kind,
              recordId: item.id,
              before: item,
              after: row,
            });
            receipt.changes.push({
              kind: row.kind,
              recordId: item.id,
              description: `${item.name}${row.quantity !== null ? `: quantity ${row.quantity}` : ": details updated"}`,
            });
          } else if (row.kind === "knowledge") {
            if (!row.subject || !row.predicate || !row.value)
              throw Error("Knowledge needs a subject, field and value.");
            if (row.date && row.date > new Date().toISOString().slice(0, 10))
              throw Error(
                "Current knowledge cannot have a future effective date.",
              );
            const supersedesId =
              review.draft.pins.knowledge[
                key(normalized(row.subject), normalized(row.predicate))
              ] ?? null;
            const beforeKnowledge =
              await tx`SELECT subject,predicate,value,effective_on::text FROM owner_knowledge WHERE asset_id=${assetId} AND owner_id=${ownerId} AND id=${supersedesId}`;
            const ok = await createKnowledgeStore(tx as unknown as Sql, {
              inTransaction: true,
            }).record(assetId, ownerId, {
              subject: row.subject,
              predicate: row.predicate,
              value: row.value,
              kind: "current_fact",
              effectiveOn: row.date ?? new Date().toISOString().slice(0, 10),
              provenance: `Owner approved review ${id}. ${row.reason}`,
              supersedesId,
            });
            if (!ok)
              throw Error(
                "That knowledge changed since preparation. Request a fresh update.",
              );
            audit.push({
              kind: row.kind,
              recordId: row.subject,
              before: beforeKnowledge[0] ?? null,
              after: row,
            });
            receipt.changes.push({
              kind: row.kind,
              recordId: row.subject,
              description: `${row.subject} / ${row.predicate}: ${row.value}`,
            });
          } else {
            if (!row.documentId || !row.identifier || !row.wording)
              throw Error(
                "Survey items need the source document, identifier and original wording.",
              );
            await evidenceCheck([
              {
                documentId: row.documentId,
                pageNumber: row.pageNumber,
                quote: row.wording,
              },
            ]);
            const original = review.draft.rows.find((r) => r.id === row.id);
            const originalSurvey = original?.kind === "survey" ? original : row;
            const oldKey = key(
              originalSurvey.documentId,
              originalSurvey.identifier,
            );
            const expected = review.draft.pins.survey[oldKey] ?? null;
            const targetDocument =
              expected === null ? row.documentId : originalSurvey.documentId;
            const targetIdentifier =
              expected === null ? row.identifier : originalSurvey.identifier;
            const existing = await tx<
              SurveyItem[]
            >`SELECT * FROM survey_items WHERE asset_id=${assetId} AND owner_id=${ownerId} AND document_id=${targetDocument} AND identifier=${targetIdentifier} FOR UPDATE`;
            const previous = existing[0];
            if ((previous?.revision ?? null) !== expected)
              throw Error("A survey item changed. Prepare a fresh review.");
            if (row.status === "repair_documented" && !row.evidence.length)
              throw Error(
                "A documented repair needs a supporting source page. Add evidence or choose a status that reflects your own confirmation.",
              );
            if (
              row.status !== "open" &&
              row.status !== "no_subsequent_evidence" &&
              row.status !== "needs_review" &&
              !row.notes &&
              !row.evidence.length
            )
              throw Error("Describe why this survey status is supported.");
            const result = previous
              ? await tx<
                  { id: string }[]
                >`UPDATE survey_items SET document_id=${row.documentId},identifier=${row.identifier},priority=${row.priority},wording=${row.wording},page_number=${row.pageNumber},status=${row.status},notes=${row.notes},evidence=${JSON.stringify(row.evidence)}::jsonb,revision=revision+1,approved_at=now() WHERE id=${previous.id} AND asset_id=${assetId} AND owner_id=${ownerId} RETURNING id`
              : await tx<
                  { id: string }[]
                >`INSERT INTO survey_items(asset_id,owner_id,document_id,identifier,priority,wording,page_number,status,notes,evidence) VALUES(${assetId},${ownerId},${row.documentId},${row.identifier},${row.priority},${row.wording},${row.pageNumber},${row.status},${row.notes},${JSON.stringify(row.evidence)}::jsonb) RETURNING id`;
            audit.push({
              kind: row.kind,
              recordId: result[0].id,
              before: previous ?? null,
              after: row,
            });
            receipt.changes.push({
              kind: row.kind,
              recordId: result[0].id,
              description: `${row.priority} ${row.identifier}: ${row.status.replaceAll("_", " ")}`,
            });
          }
        }
        const coverage = {
          confirmed: coverageConfirmed === true,
          items: draft.rows
            .filter(
              (r): r is Extract<ReviewRow, { kind: "survey" }> =>
                r.kind === "survey",
            )
            .map((r) => ({
              documentId: r.documentId,
              identifier: r.identifier,
            })),
        };
        await tx`INSERT INTO update_audit(review_id,asset_id,owner_id,changes) VALUES(${id},${assetId},${ownerId},${JSON.stringify(audit)}::jsonb)`;
        receipt.coverage = coverage;
        await tx`UPDATE update_reviews SET status='saved',receipt=${JSON.stringify(receipt)}::jsonb,saved_at=now() WHERE id=${id}`;
        return receipt;
      }) as Promise<Receipt>;
    },
  };
}
