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

function documentErrorUrl(assetId: string, message: string) {
  return `/assets/${encodeURIComponent(assetId)}?documentError=${encodeURIComponent(message)}#documents`;
}

export async function uploadDocument(assetId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const asset = await getAsset(assetId, session.user.id);
  if (!asset) notFound();

  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!title || title.length > 200) {
    redirect(documentErrorUrl(assetId, "Enter a document title of 200 characters or fewer."));
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(documentErrorUrl(assetId, "Choose a PDF to upload."));
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    redirect(documentErrorUrl(assetId, "Document Library v1 accepts PDF files only."));
  }
  if (file.size > MAX_FILE_BYTES) {
    redirect(documentErrorUrl(assetId, "PDF must be 20 MB or smaller."));
  }

  const storageKey = `assets/${assetId}/documents/${randomUUID()}-${safeFilename(file.name)}`;

  try {
    await storeDocument(storageKey, file);
  } catch (error) {
    console.error("Document upload storage failure", error);
    redirect(documentErrorUrl(assetId, "Document storage is not configured yet. Your PDF was not uploaded."));
  }

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
