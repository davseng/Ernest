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
  dateText: string | null;
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

export async function extractMaintenanceCandidates(pages: ExtractedDocumentPage[], guidance = "") {
  const source = pages.map((p) => `PAGE ${p.pageNumber}\n${p.text}`).join("\n\n---\n\n");
  if (!source.trim()) return [];

  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: "low" },
    instructions: [
      "Extract maintenance/service events from the supplied document text only.",
      "User guidance may disambiguate document formatting, but it cannot create facts that are absent from the document.",
      "Do not infer missing dates, hours, parts, fluids, service intervals, or actions beyond explicit user guidance.",
      "Keep each event tied to the PDF page that supports it.",
      "Preserve the date exactly as written in dateText. Only populate occurredOn when the document plus guidance establishes a complete calendar date; otherwise use null.",
      "Preserve part numbers and consumable names exactly when readable.",
      "A historical pattern is not a manufacturer recommendation.",
      "Return JSON only: {\"events\":[{\"pageNumber\":1,\"dateText\":\"date exactly as written or null\",\"occurredOn\":\"YYYY-MM-DD or null\",\"engineHours\":\"number or null\",\"action\":\"text\",\"partsConsumables\":\"text or null\",\"notes\":\"text or null\"}]}",
    ].join(" "),
    input: `${guidance.trim() ? `USER PARSING GUIDANCE:\n${guidance.trim()}\n\n` : ""}DOCUMENT TEXT:\n${source}`,
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
      dateText: clean(event.dateText),
      occurredOn: clean(event.occurredOn),
      engineHours: clean(event.engineHours),
      action,
      partsConsumables: clean(event.partsConsumables),
      notes: clean(event.notes),
    }];
  });
}

export async function saveMaintenanceGuidance(documentId: string, assetId: string, ownerId: string, guidance: string) {
  const sql = database();
  await sql`
    UPDATE documents d SET maintenance_guidance=${clean(guidance)}
    FROM assets a
    WHERE d.id=${documentId} AND d.asset_id=${assetId} AND a.id=d.asset_id AND a.owner_id=${ownerId}`;
}

export async function getMaintenanceGuidance(documentId: string, assetId: string, ownerId: string) {
  const rows = await database()<Array<{maintenance_guidance:string|null}>>`
    SELECT d.maintenance_guidance FROM documents d
    JOIN assets a ON a.id=d.asset_id
    WHERE d.id=${documentId} AND d.asset_id=${assetId} AND a.owner_id=${ownerId}`;
  return rows[0]?.maintenance_guidance ?? "";
}

export async function replaceMaintenanceCandidates(documentId: string, assetId: string, ownerId: string, events: Awaited<ReturnType<typeof extractMaintenanceCandidates>>) {
  const sql = database();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM document_maintenance_candidates WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId} AND status='pending'`;
    for (const event of events) {
      await tx`INSERT INTO document_maintenance_candidates
        (document_id, asset_id, owner_id, page_number, date_text, occurred_on, engine_hours, action, parts_consumables, notes)
        VALUES (${documentId}, ${assetId}, ${ownerId}, ${event.pageNumber}, ${event.dateText}, ${event.occurredOn}, ${event.engineHours}, ${event.action}, ${event.partsConsumables}, ${event.notes})`;
    }
  });
}

export async function reviewMaintenanceCandidate(candidateId: string, documentId: string, assetId: string, ownerId: string, status: "approved" | "rejected", edits?: Partial<Pick<MaintenanceCandidate,"dateText"|"occurredOn"|"engineHours"|"action"|"partsConsumables"|"notes">>) {
  const sql = database();
  const action = edits?.action?.trim();
  await sql`
    UPDATE document_maintenance_candidates c SET
      date_text=COALESCE(${edits?.dateText ?? null}, c.date_text),
      occurred_on=COALESCE(${edits?.occurredOn ?? null}, c.occurred_on),
      engine_hours=COALESCE(${edits?.engineHours ?? null}, c.engine_hours),
      action=COALESCE(${action || null}, c.action),
      parts_consumables=COALESCE(${edits?.partsConsumables ?? null}, c.parts_consumables),
      notes=COALESCE(${edits?.notes ?? null}, c.notes),
      status=${status}, reviewed_at=now()
    FROM assets a
    WHERE c.id=${candidateId} AND c.document_id=${documentId} AND c.asset_id=${assetId}
      AND c.owner_id=${ownerId} AND a.id=c.asset_id AND a.owner_id=${ownerId}`;
}

export async function getMaintenanceCandidates(documentId: string, assetId: string, ownerId: string) {
  const rows = await database()<Array<{id:string;page_number:number;date_text:string|null;occurred_on:string|null;engine_hours:string|null;action:string;parts_consumables:string|null;notes:string|null;status:"pending"|"approved"|"rejected"}>>`
    SELECT id,page_number,date_text,occurred_on::text,engine_hours::text,action,parts_consumables,notes,status
    FROM document_maintenance_candidates
    WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId}
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, page_number, created_at`;
  return rows.map((r) => ({id:r.id,pageNumber:r.page_number,dateText:r.date_text,occurredOn:r.occurred_on,engineHours:r.engine_hours,action:r.action,partsConsumables:r.parts_consumables,notes:r.notes,status:r.status}));
}
