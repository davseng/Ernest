"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getDocumentForAsset, getDocumentPages } from "@/data/documents";
import {
  extractMaintenanceCandidates,
  replaceMaintenanceCandidates,
  reviewMaintenanceCandidate,
  saveMaintenanceGuidance,
} from "@/data/maintenance-candidates";

function pathFor(assetId: string, documentId: string) {
  return `/assets/${assetId}/documents/${documentId}`;
}

export async function generateMaintenanceCandidates(assetId: string, documentId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const document = await getDocumentForAsset(documentId, assetId, session.user.id);
  if (!document) throw new Error("Document not found");
  const pages = await getDocumentPages(documentId, assetId, session.user.id);
  if (!pages?.length) throw new Error("Extract document text first");

  const guidance = String(formData.get("guidance") ?? "").trim().slice(0, 2000);
  await saveMaintenanceGuidance(documentId, assetId, session.user.id, guidance);
  const events = await extractMaintenanceCandidates(pages, guidance);
  await replaceMaintenanceCandidates(documentId, assetId, session.user.id, events);
  revalidatePath(pathFor(assetId, documentId));
}

export async function approveMaintenanceCandidate(assetId: string, documentId: string, candidateId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  await reviewMaintenanceCandidate(candidateId, documentId, assetId, session.user.id, "approved");
  revalidatePath(pathFor(assetId, documentId));
}

export async function rejectMaintenanceCandidate(assetId: string, documentId: string, candidateId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  await reviewMaintenanceCandidate(candidateId, documentId, assetId, session.user.id, "rejected");
  revalidatePath(pathFor(assetId, documentId));
}

export async function editAndApproveMaintenanceCandidate(assetId: string, documentId: string, candidateId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const value = (name: string) => {
    const text = String(formData.get(name) ?? "").trim();
    return text || null;
  };
  await reviewMaintenanceCandidate(candidateId, documentId, assetId, session.user.id, "approved", {
    dateText: value("dateText"),
    occurredOn: value("occurredOn"),
    engineHours: value("engineHours"),
    action: value("action") ?? undefined,
    partsConsumables: value("partsConsumables"),
    notes: value("notes"),
  });
  revalidatePath(pathFor(assetId, documentId));
}
