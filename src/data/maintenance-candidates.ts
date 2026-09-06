import "server-only";

import OpenAI from "openai";
import postgres from "postgres";

import type { ExtractedDocumentPage } from "@/domain/documents";

let dbClient: ReturnType<typeof postgres> | undefined;
let aiClient: OpenAI | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  dbClient ??= postgres(url, { max: 5 });
  return dbClient;
}

function openai() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required");
  aiClient ??= new OpenAI({ apiKey: key });
  return aiClient;
}

export type MaintenanceCandidate = {
  id: string;
  pageNumber: number;
  occurredOn: string | null;
  engineHours: string | null;
  action: string;
  partsConsumables: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
};

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.replace(/\u0000/g, "").trim() : null;
}

export async function extractMaintenanceCandidates(pages: ExtractedDocumentPage[]) {
  const source = pages.map((p) => `PAGE ${p.pageNumber}\n${p.text}`).join("\n\n---\n\n");
  if (!source.trim()) return [];

  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: "low" },
    instructions: [
      "Extract maintenance/service events from the supplied document text only.",
      "Do not infer missing dates, hours, parts, fluids, service intervals, or actions.",
      "Keep each event tied to the PDF page that supports it.",
      "Preserve part numbers and consumable names exactly when readable.",
      "A historical pattern is not a manufacturer recommendation.",
      "Return JSON only: {\"events\":[{\"pageNumber\":1,\"occurredOn\":\"YYYY-MM-DD or null\",\"engineHours\":\"number or null\",\"action\":\"text\",\"partsConsumables\":\"text or null\",\"notes\":\"text or null\"}]}",
    ].join(" "),
    input: `DOCUMENT TEXT:\n${source}`,
  });

  const raw = response.output_text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw) as { events?: unknown[] };
  if (!Array.isArray(parsed.events)) return [];
  return parsed.events.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Record<string, unknown>;
    const pageNumber = Number(event.pageNumber);
    const action = clean(event.action);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !action) return [];
    return [{
      pageNumber,
      occurredOn: clean(event.occurredOn),
      engineHours: clean(event.engineHours),
      action,
      partsConsumables: clean(event.partsConsumables),
      notes: clean(event.notes),
    }];
  });
}

export async function replaceMaintenanceCandidates(documentId: string, assetId: string, ownerId: string, events: Awaited<ReturnType<typeof extractMaintenanceCandidates>>) {
  const sql = database();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM document_maintenance_candidates WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId} AND status='pending'`;
    for (const event of events) {
      await tx`INSERT INTO document_maintenance_candidates
        (document_id, asset_id, owner_id, page_number, occurred_on, engine_hours, action, parts_consumables, notes)
        VALUES (${documentId}, ${assetId}, ${ownerId}, ${event.pageNumber}, ${event.occurredOn}, ${event.engineHours}, ${event.action}, ${event.partsConsumables}, ${event.notes})`;
    }
  });
}

export async function getMaintenanceCandidates(documentId: string, assetId: string, ownerId: string) {
  const rows = await database()<Array<{id:string;page_number:number;occurred_on:string|null;engine_hours:string|null;action:string;parts_consumables:string|null;notes:string|null;status:"pending"|"approved"|"rejected"}>>`
    SELECT id,page_number,occurred_on::text,engine_hours::text,action,parts_consumables,notes,status
    FROM document_maintenance_candidates
    WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId}
    ORDER BY page_number, occurred_on NULLS LAST, created_at`;
  return rows.map((r) => ({id:r.id,pageNumber:r.page_number,occurredOn:r.occurred_on,engineHours:r.engine_hours,action:r.action,partsConsumables:r.parts_consumables,notes:r.notes,status:r.status}));
}
