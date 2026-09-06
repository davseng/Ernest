"use server";

import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getAsset } from "@/data/assets";
import {
  createDocumentForAsset,
  deleteDocumentRecord,
  getDocumentForAsset,
  updateDocumentTitle,
} from "@/data/documents";
import {
  createDocumentUploadUrl,
  deleteStoredDocument,
  inspectDocument,
  storeDocumentBytes,
} from "@/data/document-storage";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document.pdf";
}

async function ownedAsset(assetId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(assetId, session.user.id);
  if (!asset) notFound();
  return { asset, ownerId: session.user.id };
}

function storageKey(assetId: string, filename: string) {
  return `assets/${assetId}/documents/${randomUUID()}-${safeFilename(filename)}`;
}

function validatePdfMetadata(title: string, filename: string, contentType: string, sizeBytes: number) {
  if (!title || title.length > 200) throw new Error("Enter a document title of 200 characters or fewer.");
  if (!filename.toLowerCase().endsWith(".pdf") && contentType !== "application/pdf") {
    throw new Error("Document Library accepts PDF files only.");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error("Choose a PDF to upload.");
  if (sizeBytes > MAX_FILE_BYTES) throw new Error("PDF must be 20 MB or smaller.");
}

export async function prepareDirectUpload(assetId: string, input: {
  title: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}) {
  await ownedAsset(assetId);
  const title = input.title.trim();
  const contentType = input.contentType || "application/pdf";
  validatePdfMetadata(title, input.filename, contentType, input.sizeBytes);
  const key = storageKey(assetId, input.filename);
  const uploadUrl = await createDocumentUploadUrl(key, contentType);
  return { uploadUrl, storageKey: key, title, contentType };
}

export async function completeDirectUpload(assetId: string, input: {
  storageKey: string;
  title: string;
  filename: string;
  contentType: string;
  expectedSizeBytes: number;
}) {
  const { ownerId } = await ownedAsset(assetId);
  const expectedPrefix = `assets/${assetId}/documents/`;
  if (!input.storageKey.startsWith(expectedPrefix)) throw new Error("Invalid document upload target.");

  const stored = await inspectDocument(input.storageKey);
  validatePdfMetadata(input.title.trim(), input.filename, stored.contentType || input.contentType, stored.sizeBytes);
  if (stored.sizeBytes !== input.expectedSizeBytes) {
    await deleteStoredDocument(input.storageKey).catch(() => undefined);
    throw new Error("Uploaded file size did not match the selected PDF. Please try again.");
  }

  const createdId = await createDocumentForAsset(assetId, ownerId, {
    title: input.title.trim(),
    originalFilename: input.filename,
    contentType: stored.contentType || input.contentType || "application/pdf",
    sizeBytes: stored.sizeBytes,
    storageKey: input.storageKey,
    sourceType: "upload",
  });
  if (!createdId) {
    await deleteStoredDocument(input.storageKey).catch(() => undefined);
    notFound();
  }
  revalidatePath(`/assets/${assetId}`);
  revalidatePath(`/assets/${assetId}/documents`);
  return { documentId: createdId };
}

function assertPublicHttpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Document URL must use https://");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("Private URLs are not allowed.");
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const parts = hostname.split(".").map(Number);
    const [a, b] = parts;
    if (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) throw new Error("Private URLs are not allowed.");
  }
  if (ipVersion === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80"))) {
    throw new Error("Private URLs are not allowed.");
  }
  return url;
}

async function fetchPublicPdf(startUrl: string) {
  let url = assertPublicHttpsUrl(startUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("Too many redirects while downloading the PDF.");
      url = assertPublicHttpsUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Unable to download PDF (${response.status}).`);
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_FILE_BYTES) throw new Error("PDF must be 20 MB or smaller.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("The URL returned an empty file.");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("PDF must be 20 MB or smaller.");
    const contentType = response.headers.get("content-type")?.split(";")[0].trim() || "application/pdf";
    if (contentType !== "application/pdf" && !url.pathname.toLowerCase().endsWith(".pdf")) {
      throw new Error("The URL did not return a PDF.");
    }
    return { bytes, contentType, finalUrl: url.toString() };
  }
  throw new Error("Unable to download PDF.");
}

export async function uploadDocumentFromUrl(assetId: string, formData: FormData) {
  const { ownerId } = await ownedAsset(assetId);
  const title = String(formData.get("title") ?? "").trim();
  const sourceUrl = String(formData.get("url") ?? "").trim();
  if (!title || title.length > 200) throw new Error("Enter a document title of 200 characters or fewer.");

  const download = await fetchPublicPdf(sourceUrl);
  const final = new URL(download.finalUrl);
  const filename = safeFilename(final.pathname.split("/").pop() || `${title}.pdf`);
  const filenameWithPdf = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  const key = storageKey(assetId, filenameWithPdf);
  await storeDocumentBytes(key, download.bytes, download.contentType);

  const createdId = await createDocumentForAsset(assetId, ownerId, {
    title,
    originalFilename: filenameWithPdf,
    contentType: download.contentType,
    sizeBytes: download.bytes.byteLength,
    storageKey: key,
    sourceType: "url",
    sourceUrl: download.finalUrl,
  });
  if (!createdId) {
    await deleteStoredDocument(key).catch(() => undefined);
    notFound();
  }
  revalidatePath(`/assets/${assetId}`);
  revalidatePath(`/assets/${assetId}/documents`);
  redirect(`/assets/${encodeURIComponent(assetId)}/documents/${encodeURIComponent(createdId)}`);
}

export async function renameDocument(assetId: string, documentId: string, formData: FormData) {
  const { ownerId } = await ownedAsset(assetId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > 200) throw new Error("Enter a document title of 200 characters or fewer.");
  const updated = await updateDocumentTitle(documentId, assetId, ownerId, title);
  if (!updated) notFound();
  revalidatePath(`/assets/${assetId}`);
  revalidatePath(`/assets/${assetId}/documents`);
  revalidatePath(`/assets/${assetId}/documents/${documentId}`);
}

export async function removeDocument(assetId: string, documentId: string) {
  const { ownerId } = await ownedAsset(assetId);
  const document = await getDocumentForAsset(documentId, assetId, ownerId);
  if (!document) notFound();
  await deleteStoredDocument(document.storageKey);
  const deleted = await deleteDocumentRecord(documentId, assetId, ownerId);
  if (!deleted) notFound();
  revalidatePath(`/assets/${assetId}`);
  revalidatePath(`/assets/${assetId}/documents`);
  redirect(`/assets/${encodeURIComponent(assetId)}/documents`);
}
