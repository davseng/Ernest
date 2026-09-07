"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDocumentPages } from "@/data/documents";
import {
  approveProcedureCandidate,
  extractProcedureCandidates,
  rejectProcedureCandidate,
  replaceProcedureCandidates,
  type ExtractedProcedureCandidate,
  type ProcedureType,
} from "@/data/procedures";

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mergeCandidates(candidates: ExtractedProcedureCandidate[]) {
  const merged = new Map<string, ExtractedProcedureCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.procedureType}:${normalizeTitle(candidate.title)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }

    const seen = new Set(existing.steps.map((step) => step.instruction.toLowerCase().replace(/\s+/g, " ").trim()));
    for (const step of candidate.steps) {
      const stepKey = step.instruction.toLowerCase().replace(/\s+/g, " ").trim();
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

export async function scanDocumentForProcedures(assetId: string, documentId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const pages = await getDocumentPages(documentId, assetId, session.user.id);
  if (!pages?.length) return;

  // Keep each AI request small enough for an interactive Server Action while giving
  // adjacent pages enough context to preserve checklist headings and continuations.
  const batches: typeof pages[] = [];
  for (let start = 0; start < pages.length; start += 3) {
    batches.push(pages.slice(start, start + 4));
  }

  const results = await Promise.all(batches.map((batch) => extractProcedureCandidates(batch)));
  const candidates = mergeCandidates(results.flat());
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
