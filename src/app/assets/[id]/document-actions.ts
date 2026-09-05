"use server";

import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { createDocumentForAsset } from "@/data/documents";
import { storeDocument } from "@/data/document-storage";
import { getAsset } from "@/data/assets";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document.pdf";
}

export async function uploadDocument(assetId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const asset = await getAsset(assetId, session.user.id);
  if (!asset) notFound();

  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!title || title.length > 200) {
    redirect(`/assets/${encodeURIComponent(assetId)}?documentError=${encodeURIComponent("Enter a document title of 200 characters or fewer.")}#documents`);
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/assets/${encodeURIComponent(assetId)}?documentError=${encodeURIComponent("Choose a PDF to upload.")}#documents`);
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    redirect(`/assets/${encodeURIComponent(assetId)}?documentError=${encodeURIComponent("Document Library v1 accepts PDF files only.")}#documents`);
  }
  if (file.size > MAX_FILE_BYTES) {
    redirect(`/assets/${encodeURIComponent(assetId)}?documentError=${encodeURIComponent("PDF must be 20 MB or smaller.")}#documents`);
  }

  const storageKey = `assets/${assetId}/documents/${randomUUID()}-${safeFilename(file.name)}`;
  await storeDocument(storageKey, file);

  const created = await createDocumentForAsset(assetId, session.user.id, {
    title,
    originalFilename: file.name,
    contentType: file.type || "application/pdf",
    sizeBytes: file.size,
    storageKey,
  });
  if (!created) notFound();

  redirect(`/assets/${encodeURIComponent(assetId)}#documents`);
}
