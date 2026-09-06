"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getDocumentForAsset, getDocumentPages } from "@/data/documents";
import { extractMaintenanceCandidates, replaceMaintenanceCandidates } from "@/data/maintenance-candidates";

export async function generateMaintenanceCandidates(assetId: string, documentId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const document = await getDocumentForAsset(documentId, assetId, session.user.id);
  if (!document) throw new Error("Document not found");
  const pages = await getDocumentPages(documentId, assetId, session.user.id);
  if (!pages?.length) throw new Error("Extract document text first");

  const events = await extractMaintenanceCandidates(pages);
  await replaceMaintenanceCandidates(documentId, assetId, session.user.id, events);
  revalidatePath(`/assets/${assetId}/documents/${documentId}`);
}
