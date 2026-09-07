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

export type EquipmentCandidate = {
  id: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  systemHint: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  verifiedComponentId: string | null;
};

export async function extractEquipmentCandidates(pages: ExtractedDocumentPage[]) {
  const source = pages.map((p) => `PAGE ${p.pageNumber}\n${p.text}`).join("\n\n---\n\n");
  if (!source.trim()) return [];

  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: "low" },
    instructions: [
      "Extract candidates for installed equipment from the supplied vessel document text only.",
      "A candidate should represent a physical installed component or major onboard appliance/electronic/mechanical device, not a consumable, spare, generic material, survey finding, or maintenance action.",
      "Do not claim the equipment is currently installed. These are review candidates only.",
      "Do not infer manufacturer, model, serial number, location, or system when absent. Use null.",
      "Prefer specific named equipment such as engine, chartplotter, radar, autopilot, windlass, heater, inverter/charger, alternator, battery bank, VHF, AIS, pumps, generators, refrigeration, and similar installed systems.",
      "Keep each candidate tied to the page that explicitly supports it.",
      "If the same exact equipment appears repeatedly on the same page, return it once.",
      "Return JSON only: {\"equipment\":[{\"pageNumber\":1,\"name\":\"component name\",\"manufacturer\":\"text or null\",\"model\":\"text or null\",\"serialNumber\":\"text or null\",\"location\":\"text or null\",\"systemHint\":\"short category or null\",\"notes\":\"brief source-supported qualifier or null\"}]}",
    ].join(" "),
    input: `DOCUMENT TEXT:\n${source}`,
  });

  const raw = response.output_text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw) as { equipment?: unknown[] };
  if (!Array.isArray(parsed.equipment)) return [];

  return parsed.equipment.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const pageNumber = Number(row.pageNumber);
    const name = clean(row.name);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !name) return [];
    return [{
      pageNumber,
      name,
      manufacturer: clean(row.manufacturer),
      model: clean(row.model),
      serialNumber: clean(row.serialNumber),
      location: clean(row.location),
      systemHint: clean(row.systemHint),
      notes: clean(row.notes),
    }];
  });
}

export async function replaceEquipmentCandidates(
  documentId: string,
  assetId: string,
  ownerId: string,
  candidates: Awaited<ReturnType<typeof extractEquipmentCandidates>>,
) {
  const sql = database();
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM equipment_candidates
      WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId} AND status='pending'`;
    for (const candidate of candidates) {
      await tx`
        INSERT INTO equipment_candidates
          (asset_id, owner_id, document_id, page_number, name, manufacturer, model, serial_number, location, system_hint, notes)
        VALUES
          (${assetId}, ${ownerId}, ${documentId}, ${candidate.pageNumber}, ${candidate.name}, ${candidate.manufacturer},
           ${candidate.model}, ${candidate.serialNumber}, ${candidate.location}, ${candidate.systemHint}, ${candidate.notes})`;
    }
  });
}

export async function getEquipmentCandidates(assetId: string, ownerId: string) {
  const rows = await database()<Array<{
    id:string; document_id:string; document_title:string; page_number:number; name:string; manufacturer:string|null;
    model:string|null; serial_number:string|null; location:string|null; system_hint:string|null; notes:string|null;
    status:"pending"|"approved"|"rejected"; verified_component_id:string|null;
  }>>`
    SELECT c.id, c.document_id, d.title AS document_title, c.page_number, c.name, c.manufacturer, c.model,
      c.serial_number, c.location, c.system_hint, c.notes, c.status, c.verified_component_id
    FROM equipment_candidates c
    INNER JOIN documents d ON d.id=c.document_id
    INNER JOIN assets a ON a.id=c.asset_id
    WHERE c.asset_id=${assetId} AND c.owner_id=${ownerId} AND a.owner_id=${ownerId}
    ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      lower(c.name), c.document_id, c.page_number`;
  return rows.map((r) => ({
    id:r.id, documentId:r.document_id, documentTitle:r.document_title, pageNumber:r.page_number,
    name:r.name, manufacturer:r.manufacturer, model:r.model, serialNumber:r.serial_number, location:r.location,
    systemHint:r.system_hint, notes:r.notes, status:r.status, verifiedComponentId:r.verified_component_id,
  }));
}

export async function rejectEquipmentCandidate(candidateId: string, assetId: string, ownerId: string) {
  const rows = await database()`
    UPDATE equipment_candidates c SET status='rejected', reviewed_at=now()
    FROM assets a
    WHERE c.id=${candidateId} AND c.asset_id=${assetId} AND c.owner_id=${ownerId}
      AND a.id=c.asset_id AND a.owner_id=${ownerId}
    RETURNING c.id`;
  return rows.length === 1;
}

export async function approveEquipmentCandidate(
  candidateId: string,
  assetId: string,
  ownerId: string,
  systemChoice: { systemId?: string; newSystemName?: string },
  edits: { name:string; manufacturer:string; model:string; serialNumber?:string; location:string; notes:string },
) {
  const sql = database();
  return sql.begin(async (tx) => {
    const candidates = await tx<Array<{id:string; document_id:string}>>`
      SELECT c.id, c.document_id FROM equipment_candidates c
      INNER JOIN assets a ON a.id=c.asset_id
      WHERE c.id=${candidateId} AND c.asset_id=${assetId} AND c.owner_id=${ownerId} AND c.status='pending'
        AND a.owner_id=${ownerId}
      FOR UPDATE`;
    if (candidates.length !== 1) return false;

    let systemId = systemChoice.systemId?.trim() || "";
    if (systemId) {
      const ownedSystems = await tx<Array<{id:string}>>`
        SELECT s.id FROM systems s
        INNER JOIN assets a ON a.id=s.asset_id
        WHERE s.id=${systemId} AND a.id=${assetId} AND a.owner_id=${ownerId}`;
      if (ownedSystems.length !== 1) return false;
    } else {
      const newSystemName = systemChoice.newSystemName?.trim() || "";
      if (!newSystemName) return false;

      const existing = await tx<Array<{id:string}>>`
        SELECT s.id FROM systems s
        INNER JOIN assets a ON a.id=s.asset_id
        WHERE a.id=${assetId} AND a.owner_id=${ownerId} AND lower(s.name)=lower(${newSystemName})
        ORDER BY s.position
        LIMIT 1`;

      if (existing[0]?.id) {
        systemId = existing[0].id;
      } else {
        systemId = randomUUID();
        const createdSystem = await tx`
          INSERT INTO systems (id, asset_id, name, description, position)
          SELECT ${systemId}, a.id, ${newSystemName}, 'Equipment category created during candidate verification.',
            COALESCE((SELECT MAX(position)+1 FROM systems WHERE asset_id=a.id), 0)
          FROM assets a
          WHERE a.id=${assetId} AND a.owner_id=${ownerId}
          RETURNING id`;
        if (createdSystem.length !== 1) return false;
      }
    }

    const componentId = randomUUID();
    const inserted = await tx`
      INSERT INTO components (id, system_id, name, manufacturer, model, serial_number, location, notes, position)
      SELECT ${componentId}, s.id, ${edits.name}, ${edits.manufacturer}, ${edits.model}, ${edits.serialNumber || null},
        ${edits.location}, ${edits.notes}, COALESCE((SELECT MAX(position)+1 FROM components WHERE system_id=s.id), 0)
      FROM systems s INNER JOIN assets a ON a.id=s.asset_id
      WHERE s.id=${systemId} AND a.id=${assetId} AND a.owner_id=${ownerId}
      RETURNING id`;
    if (inserted.length !== 1) return false;

    await tx`
      INSERT INTO component_documents (component_id, document_id, asset_id, owner_id, relationship)
      VALUES (${componentId}, ${candidates[0].document_id}, ${assetId}, ${ownerId}, 'reference')
      ON CONFLICT (component_id, document_id) DO NOTHING`;

    await tx`
      UPDATE equipment_candidates
      SET status='approved', verified_component_id=${componentId}, reviewed_at=now()
      WHERE id=${candidateId} AND asset_id=${assetId} AND owner_id=${ownerId}`;
    return true;
  });
}
