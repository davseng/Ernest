import "server-only";

import { randomUUID } from "node:crypto";
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

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.replace(/\u0000/g, "").trim() : null;
}

export type ProcedureType = "routine" | "checklist" | "emergency";
export type ProcedureStep = { id?: string; position: number; instruction: string; note: string | null };
export type ProcedureRecord = { id:string; title:string; procedureType:ProcedureType; notes:string|null; sourceDocumentId:string|null; sourceDocumentTitle:string|null; sourcePage:number|null; steps:ProcedureStep[] };
export type ProcedureCandidate = { id:string; documentId:string; documentTitle:string; pageNumber:number; title:string; procedureType:ProcedureType; notes:string|null; steps:Array<{instruction:string;note:string|null}>; status:"pending"|"approved"|"rejected"; verifiedProcedureId:string|null };

export type ExtractedProcedureCandidate = {
  pageNumber: number;
  title: string;
  procedureType: ProcedureType;
  notes: string | null;
  steps: Array<{ instruction: string; note: string | null }>;
};

export async function extractProcedureCandidates(pages: ExtractedDocumentPage[]): Promise<ExtractedProcedureCandidate[]> {
  const source = pages.map((p) => `PAGE ${p.pageNumber}\n${p.text}`).join("\n\n---\n\n");
  if (!source.trim()) return [];

  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: "low" },
    max_output_tokens: 7000,
    instructions: [
      "Extract procedural knowledge from the supplied vessel document text only.",
      "The unit of extraction is a COMPLETE PROCEDURE, not an individual checklist item.",
      "A procedure must have a title or heading plus an ordered sequence of explicit actions supported by the source.",
      "When a heading is followed by checkbox items, bullets, numbered actions, or short action lines, create ONE candidate whose title is the heading and whose steps are ALL of those action lines in source order until the next procedure heading.",
      "NEVER turn an individual checklist action such as 'Turn on the chart plotter', 'Start the autopilot', 'Check the bilge', or similar item into its own procedure candidate when it appears beneath a broader checklist heading.",
      "Do not move descriptive qualifiers into the procedure title. Keep the action itself as the step instruction and put only source-supported qualifiers in the step note or procedure notes.",
      "Classify each complete procedure as emergency, checklist, or routine. Emergency means an immediate safety response such as fire, flooding, grounding, abandon ship, man overboard, steering failure, or similar urgent response. Checklist means a repeatable pre-departure, shutdown, unattended-boat, arrival, anchoring, safety, or inspection checklist. Routine means a non-emergency operating or maintenance procedure with ordered steps.",
      "Completeness is critical: include EVERY supported action item as a separate step.",
      "Do not summarize several checklist items into one step. Do not create one candidate per bullet or checkbox.",
      "A heading by itself is not a procedure. An isolated single action is not a procedure candidate for this scanner; it belongs as a step within its surrounding procedure when the source provides one.",
      "If a procedure continues onto the next supplied page, keep it as one candidate and include the continued steps. Use the page where the procedure begins as pageNumber.",
      "Do not invent missing steps, warnings, limits, settings, quantities, or sequences. Do not combine separate procedures unless the source clearly presents them as one.",
      "Preserve source wording closely but remove purely decorative numbering or checkbox symbols.",
      "Before returning JSON, verify that every candidate represents a complete source-defined procedure and that no candidate title is merely one of that procedure's action items.",
      "Return JSON only: {\"procedures\":[{\"pageNumber\":1,\"title\":\"title\",\"procedureType\":\"routine|checklist|emergency\",\"notes\":\"source-supported context or null\",\"steps\":[{\"instruction\":\"action\",\"note\":\"source-supported qualifier or null\"}]}]}",
    ].join(" "),
    input: `DOCUMENT TEXT:\n${source}`,
  });

  const raw = response.output_text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw) as { procedures?: unknown[] };
  if (!Array.isArray(parsed.procedures)) return [];

  return parsed.procedures.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const pageNumber = Number(row.pageNumber);
    const title = clean(row.title);
    const procedureType = clean(row.procedureType) as ProcedureType | null;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !title || !procedureType || !["routine", "checklist", "emergency"].includes(procedureType)) return [];
    const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
    const steps = stepsRaw.flatMap((step) => {
      if (!step || typeof step !== "object") return [];
      const s = step as Record<string, unknown>;
      const instruction = clean(s.instruction);
      if (!instruction) return [];
      return [{ instruction, note: clean(s.note) }];
    });
    if (steps.length < 2) return [];
    return [{ pageNumber, title, procedureType, notes: clean(row.notes), steps }];
  });
}

export async function replaceProcedureCandidates(documentId: string, assetId: string, ownerId: string, candidates: ExtractedProcedureCandidate[]) {
  const sql = database();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM procedure_candidates WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId} AND status='pending'`;
    for (const candidate of candidates) {
      await tx`INSERT INTO procedure_candidates (asset_id, owner_id, document_id, page_number, title, procedure_type, notes, steps_json)
        VALUES (${assetId}, ${ownerId}, ${documentId}, ${candidate.pageNumber}, ${candidate.title}, ${candidate.procedureType}, ${candidate.notes}, ${JSON.stringify(candidate.steps)}::jsonb)`;
    }
  });
}

export async function getProcedureCandidates(assetId: string, ownerId: string) {
  const rows = await database()<Array<{ id:string; document_id:string; document_title:string; page_number:number; title:string; procedure_type:ProcedureType; notes:string|null; steps_json:unknown; status:"pending"|"approved"|"rejected"; verified_procedure_id:string|null }>>`
    SELECT c.id, c.document_id, d.title AS document_title, c.page_number, c.title, c.procedure_type,
      c.notes, c.steps_json, c.status, c.verified_procedure_id
    FROM procedure_candidates c
    INNER JOIN documents d ON d.id=c.document_id
    INNER JOIN assets a ON a.id=c.asset_id
    WHERE c.asset_id=${assetId} AND c.owner_id=${ownerId} AND a.owner_id=${ownerId}
    ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      CASE c.procedure_type WHEN 'emergency' THEN 0 WHEN 'checklist' THEN 1 ELSE 2 END,
      lower(c.title), c.page_number`;

  return rows.map((r) => ({ id:r.id, documentId:r.document_id, documentTitle:r.document_title, pageNumber:r.page_number, title:r.title, procedureType:r.procedure_type, notes:r.notes, steps:Array.isArray(r.steps_json) ? (r.steps_json as Array<{instruction:string;note:string|null}>) : [], status:r.status, verifiedProcedureId:r.verified_procedure_id } satisfies ProcedureCandidate));
}

export async function getProcedures(assetId: string, ownerId: string) {
  const rows = await database()<Array<{ id:string; title:string; procedure_type:ProcedureType; notes:string|null; source_document_id:string|null; document_title:string|null; source_page:number|null; step_id:string|null; step_position:number|null; instruction:string|null; step_note:string|null }>>`
    SELECT p.id, p.title, p.procedure_type, p.notes, p.source_document_id, d.title AS document_title, p.source_page,
      s.id AS step_id, s.position AS step_position, s.instruction, s.note AS step_note
    FROM procedures p
    INNER JOIN assets a ON a.id=p.asset_id
    LEFT JOIN documents d ON d.id=p.source_document_id
    LEFT JOIN procedure_steps s ON s.procedure_id=p.id
    WHERE p.asset_id=${assetId} AND p.owner_id=${ownerId} AND a.owner_id=${ownerId}
    ORDER BY CASE p.procedure_type WHEN 'emergency' THEN 0 WHEN 'checklist' THEN 1 ELSE 2 END,
      lower(p.title), s.position`;

  const map = new Map<string, ProcedureRecord>();
  for (const row of rows) {
    let procedure = map.get(row.id);
    if (!procedure) {
      procedure = { id:row.id, title:row.title, procedureType:row.procedure_type, notes:row.notes, sourceDocumentId:row.source_document_id, sourceDocumentTitle:row.document_title, sourcePage:row.source_page, steps:[] };
      map.set(row.id, procedure);
    }
    if (row.step_id && row.step_position !== null && row.instruction) procedure.steps.push({ id:row.step_id, position:row.step_position, instruction:row.instruction, note:row.step_note });
  }
  return [...map.values()];
}

export async function rejectProcedureCandidate(candidateId: string, assetId: string, ownerId: string) {
  const rows = await database()`UPDATE procedure_candidates c SET status='rejected', reviewed_at=now()
    FROM assets a
    WHERE c.id=${candidateId} AND c.asset_id=${assetId} AND c.owner_id=${ownerId} AND a.id=c.asset_id AND a.owner_id=${ownerId}
    RETURNING c.id`;
  return rows.length === 1;
}

export async function approveProcedureCandidate(candidateId: string, assetId: string, ownerId: string, edits: { title:string; procedureType:ProcedureType; notes:string; steps:Array<{instruction:string; note:string|null}> }) {
  const sql = database();
  return sql.begin(async (tx) => {
    const candidates = await tx<Array<{id:string; document_id:string; page_number:number}>>`
      SELECT c.id, c.document_id, c.page_number FROM procedure_candidates c
      INNER JOIN assets a ON a.id=c.asset_id
      WHERE c.id=${candidateId} AND c.asset_id=${assetId} AND c.owner_id=${ownerId} AND c.status='pending' AND a.owner_id=${ownerId}
      FOR UPDATE`;
    if (candidates.length !== 1 || edits.steps.length === 0) return false;

    const procedureId = randomUUID();
    const inserted = await tx`INSERT INTO procedures (id, asset_id, owner_id, title, procedure_type, notes, source_document_id, source_page)
      VALUES (${procedureId}, ${assetId}, ${ownerId}, ${edits.title}, ${edits.procedureType}, ${edits.notes || null}, ${candidates[0].document_id}, ${candidates[0].page_number})
      RETURNING id`;
    if (inserted.length !== 1) return false;

    for (let i = 0; i < edits.steps.length; i++) {
      const step = edits.steps[i];
      await tx`INSERT INTO procedure_steps (id, procedure_id, position, instruction, note)
        VALUES (${randomUUID()}, ${procedureId}, ${i}, ${step.instruction}, ${step.note})`;
    }

    await tx`UPDATE procedure_candidates SET status='approved', verified_procedure_id=${procedureId}, reviewed_at=now()
      WHERE id=${candidateId} AND asset_id=${assetId} AND owner_id=${ownerId}`;
    return true;
  });
}
