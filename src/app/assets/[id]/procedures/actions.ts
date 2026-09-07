"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDocumentPages } from "@/data/documents";
import {
  approveProcedureCandidate,
  extractProcedureCandidates,
  rejectProcedureCandidate,
  replaceProcedureCandidates,
  type ProcedureType,
} from "@/data/procedures";

export async function scanDocumentForProcedures(assetId: string, documentId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const pages = await getDocumentPages(documentId, assetId, session.user.id);
  if (!pages?.length) return;
  const candidates = await extractProcedureCandidates(pages);
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
