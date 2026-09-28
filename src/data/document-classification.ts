import "server-only";

import OpenAI from "openai";
import { getDocumentForAsset, getDocumentPages, updateDocumentClassification } from "@/data/documents";

let client: OpenAI | undefined;
function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  client ??= new OpenAI({ apiKey });
  return client;
}

const TYPES = ["invoice","receipt","survey","manual","service_record","work_order","estimate","specification","insurance","registration","log","correspondence","other"] as const;
function clean(value: unknown, max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

export async function classifyDocument(documentId: string, assetId: string, ownerId: string) {
  const document = await getDocumentForAsset(documentId, assetId, ownerId);
  if (!document) return { ok: false as const, message: "Document not found." };
  const pages = await getDocumentPages(documentId, assetId, ownerId);
  if (!pages?.length) return { ok: false as const, message: "Extract text before classifying." };
  const excerpt = pages.slice(0, 4).map((p) => "PAGE " + p.pageNumber + "\n" + p.text.slice(0, 5000)).join("\n\n---\n\n");
  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna", reasoning: { effort: "low" },
    instructions: "Classify only from supplied text. Do not invent facts. Return JSON with documentType, documentDate, summary. documentDate is YYYY-MM-DD only when a complete document date is explicit, otherwise null. summary is 1-2 concise sentences and must distinguish proposals or estimates from completed work. documentType must be one of: " + TYPES.join(", ") + ".",
    input: "TITLE: " + document.title + "\nFILENAME: " + document.originalFilename + "\n\nDOCUMENT TEXT:\n" + excerpt,
  });
  const raw = response.output_text.trim();
  const json = raw.startsWith("{") ? raw : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const type = clean(parsed.documentType, 40) || "other";
  const documentType = TYPES.includes(type as (typeof TYPES)[number]) ? type : "other";
  const date = clean(parsed.documentDate, 10);
  const documentDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const summary = clean(parsed.summary, 1200);
  await updateDocumentClassification(documentId, assetId, ownerId, { documentType, documentDate, summary });
  return { ok: true as const, documentType, documentDate, summary };
}
