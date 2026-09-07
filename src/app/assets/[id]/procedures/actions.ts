"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDocumentPages } from "@/data/documents";
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

function classifyStructuredChecklist(title: string): ProcedureType {
  const value = title.toLowerCase();
  if (/emergency|man overboard|\bmob\b|fire|flood|grounding|abandon|steering failure|distress/.test(value)) return "emergency";
  return "checklist";
}

function extractStructuredChecklists(pages: Awaited<ReturnType<typeof getDocumentPages>>): ExtractedProcedureCandidate[] {
  if (!pages?.length) return [];

  const candidates: ExtractedProcedureCandidate[] = [];
  let current: ExtractedProcedureCandidate | null = null;
  let lastStepIndex = -1;

  function finishCurrent() {
    if (current && current.steps.length >= 2) candidates.push(current);
    current = null;
    lastStepIndex = -1;
  }

  for (const page of pages) {
    const lines = page.text.replace(/\r/g, "").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.replace(/\u0000/g, "").trim();
      if (!line) continue;

      const numberedHeading = line.match(/^\s*\d+\.\s+(.{3,120})$/);
      if (numberedHeading) {
        finishCurrent();
        current = {
          pageNumber: page.pageNumber,
          title: numberedHeading[1].trim(),
          procedureType: classifyStructuredChecklist(numberedHeading[1]),
          notes: null,
          steps: [],
        };
        continue;
      }

      const item = line.match(/^(?:☐|□|☑|✓|✔|\[\s?\]|[-•▪◦])\s*(.+)$/);
      if (item && current) {
        current.steps.push({ instruction: item[1].trim(), note: null });
        lastStepIndex = current.steps.length - 1;
        continue;
      }

      // PDF extraction often wraps one checklist item across several physical lines.
      // Only join continuation text after an explicit checklist marker has started a step.
      if (current && lastStepIndex >= 0 && line.length <= 180) {
        const previous = current.steps[lastStepIndex].instruction;
        current.steps[lastStepIndex].instruction = `${previous} ${line}`.replace(/\s+/g, " ").trim();
      }
    }
  }

  finishCurrent();
  return candidates;
}

export async function scanDocumentForProcedures(assetId: string, documentId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const pages = await getDocumentPages(documentId, assetId, session.user.id);
  if (!pages?.length) return;

  // Explicit checkbox/numbered checklists are safer and more complete when parsed
  // deterministically. Use AI for manuals and prose-oriented procedures instead.
  const structured = extractStructuredChecklists(pages);
  let candidates: ExtractedProcedureCandidate[];

  if (structured.length >= 2) {
    candidates = structured;
  } else {
    const batches: typeof pages[] = [];
    for (let start = 0; start < pages.length; start += 3) {
      batches.push(pages.slice(start, start + 4));
    }
    const results = await Promise.all(batches.map((batch) => extractProcedureCandidates(batch)));
    candidates = mergeCandidates(results.flat());
  }

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
