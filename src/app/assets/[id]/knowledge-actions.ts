"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDocumentPages } from "@/data/documents";
import {
  approveEquipmentCandidate,
  extractEquipmentCandidates,
  rejectEquipmentCandidate,
  replaceEquipmentCandidates,
} from "@/data/equipment-candidates";
import { linkDocumentToComponent, unlinkDocumentFromComponent } from "@/data/equipment-knowledge";

const relationships = new Set(["manual", "service", "reference", "other"]);

export async function scanDocumentForEquipment(assetId: string, documentId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const pages = await getDocumentPages(documentId, assetId, session.user.id);
  if (!pages?.length) return;
  const candidates = await extractEquipmentCandidates(pages);
  await replaceEquipmentCandidates(documentId, assetId, session.user.id, candidates);
  revalidatePath(`/assets/${assetId}/knowledge`);
}

export async function approveEquipment(assetId: string, candidateId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const systemId = String(formData.get("systemId") ?? "").trim();
  const newSystemName = String(formData.get("newSystemName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if ((!systemId && !newSystemName) || !name) return;
  await approveEquipmentCandidate(candidateId, assetId, session.user.id, { systemId: systemId || undefined, newSystemName: newSystemName || undefined }, {
    name,
    manufacturer: String(formData.get("manufacturer") ?? "").trim(),
    model: String(formData.get("model") ?? "").trim(),
    serialNumber: String(formData.get("serialNumber") ?? "").trim() || undefined,
    location: String(formData.get("location") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  revalidatePath(`/assets/${assetId}/knowledge`);
  revalidatePath(`/assets/${assetId}`);
}

export async function rejectEquipment(assetId: string, candidateId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await rejectEquipmentCandidate(candidateId, assetId, session.user.id);
  revalidatePath(`/assets/${assetId}/knowledge`);
}

export async function linkEquipmentDocument(assetId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const componentId = String(formData.get("componentId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const relationship = String(formData.get("relationship") ?? "manual");
  if (!componentId || !documentId || !relationships.has(relationship)) return;
  await linkDocumentToComponent(
    assetId,
    session.user.id,
    componentId,
    documentId,
    relationship as "manual" | "service" | "reference" | "other",
  );
  revalidatePath(`/assets/${assetId}/knowledge`);
}

export async function unlinkEquipmentDocument(
  assetId: string,
  componentId: string,
  documentId: string,
) {
  const session = await auth();
  if (!session?.user?.id) return;
  await unlinkDocumentFromComponent(assetId, session.user.id, componentId, documentId);
  revalidatePath(`/assets/${assetId}/knowledge`);
}
