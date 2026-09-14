import "server-only";

import postgres from "postgres";

import { buildAssetExport } from "@/data/asset-export";

let client: ReturnType<typeof postgres> | undefined;
function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  client ??= postgres(url, { max: 5 });
  return client;
}

/**
 * Experimental read-only package for the offline POC. This deliberately
 * includes extracted text so local retrieval can work without Neon/R2.
 * It never includes R2 keys, credentials, signed URLs, or original binaries.
 */
export async function buildOfflineAssetPackage(assetId: string, ownerId: string) {
  const snapshot = await buildAssetExport(assetId, ownerId);
  if (!snapshot) return undefined;

  const pages = await database()<Array<Record<string, unknown>>>`
    SELECT p.document_id,d.title AS document_title,p.page_number,p.text_content
    FROM document_pages p
    INNER JOIN documents d ON d.id=p.document_id
    INNER JOIN assets a ON a.id=d.asset_id
    WHERE d.asset_id=${assetId}
      AND d.owner_id=${ownerId}
      AND a.owner_id=${ownerId}
    ORDER BY d.title,p.page_number`;

  const chunks = await database()<Array<Record<string, unknown>>>`
    SELECT c.document_id,d.title AS document_title,c.page_number,c.chunk_index,c.text_content
    FROM document_chunks c
    INNER JOIN documents d ON d.id=c.document_id
    INNER JOIN assets a ON a.id=d.asset_id
    WHERE d.asset_id=${assetId}
      AND d.owner_id=${ownerId}
      AND a.owner_id=${ownerId}
    ORDER BY d.title,c.page_number,c.chunk_index`;

  return {
    offlineFormat: "ernest-offline-package",
    version: 1,
    createdAt: new Date().toISOString(),
    mode: "read-only-poc",
    trustNote: "Offline answers must use only this package as evidence. Do not invent missing asset facts. Conversation history remains continuity, not verified evidence.",
    originalsNote: "Original PDFs and photos are not embedded in this POC package. Extracted document text includes document and page provenance for local grounded retrieval.",
    snapshot,
    localEvidence: {
      documentPages: pages,
      documentChunks: chunks,
    },
  };
}
