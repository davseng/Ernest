"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDocumentForAsset, getDocumentPages } from "@/data/documents";
import { readDocument } from "@/data/document-storage";
import { extractProcedureCandidatesFromPdf } from "@/data/procedure-vision";
import {
  approveProcedureCandidate,
  extractProcedureCandidates,
  getProcedureCandidates,
  rejectProcedureCandidate,
  replaceProcedureCandidates,
  type ExtractedProcedureCandidate,
  type ProcedureType,
} from "@/data/procedures";

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeStep(step: string) {
  return step.toLowerCase().replace(/\s+/g, " ").trim();
}

function mergeCandidates(candidates: ExtractedProcedureCandidate[]) {
  const merged = new Map<string, ExtractedProcedureCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.procedureType}:${normalizeTitle(candidate.title)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...candidate, steps: [...candidate.steps] });
      continue;
    }

    const seen = new Set(existing.steps.map((step) => normalizeStep(step.instruction)));
    for (const step of candidate.steps) {
      const stepKey = normalizeStep(step.instruction);
      if (!seen.has(stepKey)) {
        existing.steps.push(step);
        seen.add(stepKey);
      }
    }
    existing.pageNumber = Math.min(existing.pageNumber, candidate.pageNumber);
    existing.notes ||= candidate.notes;
  }
  return [...merged.values()];
}

async function extractFromStoredDocument(assetId: string, documentId: string, ownerId: string) {
  const document = await getDocumentForAsset(documentId, assetId, ownerId);
  if (!document) return [];

  // PDFs are interpreted from the original file so layout, headings, checkboxes,
  // indentation, columns, and page structure survive the extraction process.
  if (document.contentType === "application/pdf") {
    const bytes = await readDocument(document.storageKey);
    const visual = await extractProcedureCandidatesFromPdf(bytes, document.originalFilename);
    if (visual.length > 0) return visual;
  }

  // Fallback for non-PDF sources or PDFs where visual extraction returns nothing.
  const pages = await getDocumentPages(documentId, assetId, ownerId);
  if (!pages?.length) return [];

  const batches: typeof pages[] = [];
  for (let start = 0; start < pages.length; start += 3) {
    batches.push(pages.slice(start, start + 4));
  }
  const results = await Promise.all(batches.map((batch) => extractProcedureCandidates(batch)));
  return mergeCandidates(results.flat());
}

export async function scanDocumentForProcedures(assetId: string, documentId: string) {
  const session = await auth();
  if (!session?.user?.id) return;

  let candidates = await extractFromStoredDocument(assetId, documentId, session.user.id);

  // A rejected proposal should stay rejected on later rescans of the same source.
  const prior = await getProcedureCandidates(assetId, session.user.id);
  const rejectedKeys = new Set(
    prior
      .filter((candidate) => candidate.documentId === documentId && candidate.status === "rejected")
      .map((candidate) => `${candidate.pageNumber}:${normalizeTitle(candidate.title)}`),
  );
  candidates = candidates.filter(
    (candidate) => !rejectedKeys.has(`${candidate.pageNumber}:${normalizeTitle(candidate.title)}`),
  );

  await replaceProcedureCandidates(documentId, assetId, session.user.id, candidates);
  revalidatePath(`/assets/${assetId}/procedures`);
}

export async function approveProcedure(assetId: string, candidateId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const title = String(formData.get("title") ?? "").trim();
  const procedureType = String(formData.get("procedureType") ?? "checklist") as ProcedureType;
  const notes = String(formData.get("notes") ?? "").trim();
  const stepsText = String(formData.get("steps") ?? "");
  const steps = stepsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((instruction) => ({ instruction, note: null }));

  if (!title || !["routine", "checklist", "emergency"].includes(procedureType) || steps.length === 0) return;
  await approveProcedureCandidate(candidateId, assetId, session.user.id, { title, procedureType, notes, steps });
  revalidatePath(`/assets/${assetId}/procedures`);
}

export async function rejectProcedure(assetId: string, candidateId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await rejectProcedureCandidate(candidateId, assetId, session.user.id);
  revalidatePath(`/assets/${assetId}/procedures`);
}
