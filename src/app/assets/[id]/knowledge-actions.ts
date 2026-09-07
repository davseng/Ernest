"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { linkDocumentToComponent, unlinkDocumentFromComponent } from "@/data/equipment-knowledge";

const relationships = new Set(["manual", "service", "reference", "other"]);

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
