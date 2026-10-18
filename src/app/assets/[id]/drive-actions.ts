"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAsset } from "@/data/assets";
import { createDocumentForAsset, findDocumentBySourceUrl, getDocumentsForAsset } from "@/data/documents";
import { deleteStoredDocument, storeDocumentBytes } from "@/data/document-storage";
import { downloadDrivePdf, listInboxPdfs } from "@/data/google-drive";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PDF_HEADER_SCAN_BYTES = 1024;

function hasPdfHeader(bytes: Uint8Array) {
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, Math.min(bytes.byteLength, PDF_HEADER_SCAN_BYTES)));
  return prefix.includes("%PDF-");
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "drive-document.pdf";
}
function titleFromFilename(filename: string) {
  return (filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled document").slice(0, 200);
}

export async function importGoogleDriveInbox(assetId: string, _previousState?: { ok: boolean; message: string }) {
  void _previousState;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(assetId, session.user.id);
  if (!asset) notFound();

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];
  try {
    const files = await listInboxPdfs(session.user.id);
    const existingDocuments = await getDocumentsForAsset(assetId, session.user.id);
    const knownHashes = new Set(existingDocuments.map((document) => document.contentHash).filter((hash): hash is string => Boolean(hash)));
    for (const file of files) {
      const sourceUrl = `https://drive.google.com/file/d/${file.id}/view`;
      if (await findDocumentBySourceUrl(assetId, session.user.id, sourceUrl)) {
        skipped += 1;
        continue;
      }
      const reportedSize = Number(file.size ?? "0");
      if (reportedSize > MAX_FILE_BYTES) { failed += 1; failures.push(`${file.name}: larger than 20 MB`); continue; }
      try {
        const bytes = await downloadDrivePdf(session.user.id, file.id);
        if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) { failed += 1; continue; }
        const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
        if (file.md5Checksum && knownHashes.has(file.md5Checksum)) { skipped += 1; continue; }
        if (!hasPdfHeader(bytes)) { failed += 1; failures.push(`${file.name}: PDF header not found`); continue; }
        const filename = safeFilename(file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`);
        const storageKey = `assets/${assetId}/documents/${randomUUID()}-${filename}`;
        await storeDocumentBytes(storageKey, bytes, "application/pdf");
        let id: string | undefined;
        try {
          id = await createDocumentForAsset(assetId, session.user.id, {
          title: titleFromFilename(file.name),
          originalFilename: file.name,
          contentType: "application/pdf",
          sizeBytes: bytes.byteLength,
          storageKey,
          sourceType: "google_drive",
          sourceUrl,
          sourceExternalId: file.id,
            contentHash: file.md5Checksum,
          });
        } catch (error) {
          await deleteStoredDocument(storageKey).catch((cleanupError) => console.error("Drive import cleanup failed", cleanupError));
          throw error;
        }
        if (id) { imported += 1; if (file.md5Checksum) knownHashes.add(file.md5Checksum); }
        else {
          await deleteStoredDocument(storageKey).catch((cleanupError) => console.error("Drive import cleanup failed", cleanupError));
          failed += 1;
        }
      } catch (error) {
        console.error("Drive inbox file import failed", file.id, error);
        failed += 1;
      }
    }
  } catch (error) {
    console.error("Drive inbox import failed", error);
    return { ok: false, message: error instanceof Error ? error.message : "Could not read Ernest Inbox." };
  }

  revalidatePath(`/assets/${assetId}/documents`);
  const failureDetail = failures.length ? ` · ${failures.join(" · ")}` : "";
  return { ok: true, message: `${imported} imported · ${skipped} already in Ernest${failed ? ` · ${failed} need attention${failureDetail}` : ""}` };
}
