import "server-only";

import postgres from "postgres";

import { chunkExtractedPages } from "@/data/document-chunks";
import type { AssetDocument, ExtractedDocumentPage, NewAssetDocument } from "@/domain/documents";

let client: ReturnType<typeof postgres> | undefined;

function database() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  client ??= postgres(databaseUrl, { max: 5 });
  return client;
}

type DocumentRow = {
  id: string;
  asset_id: string;
  title: string;
  original_filename: string;
  content_type: string;
  size_bytes: string | number;
  storage_key: string;
  created_at: Date;
  extracted_at: Date | null;
  page_count: number | null;
  extraction_error: string | null;
};

type DocumentSearchRow = {
  document_id: string;
  document_title: string;
  page_number: number;
  chunk_index: number;
  page_text: string;
};

function mapDocument(row: DocumentRow): AssetDocument {
  return {
    id: row.id,
    assetId: row.asset_id,
    title: row.title,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
    createdAt: row.created_at,
    extractedAt: row.extracted_at ?? undefined,
    pageCount: row.page_count ?? undefined,
    extractionError: row.extraction_error ?? undefined,
  };
}

export async function getDocumentsForAsset(assetId: string, ownerId: string) {
  const rows = await database()<DocumentRow[]>`
    SELECT d.id, d.asset_id, d.title, d.original_filename, d.content_type,
      d.size_bytes, d.storage_key, d.created_at, d.extracted_at, d.page_count, d.extraction_error
    FROM documents d
    INNER JOIN assets a ON a.id = d.asset_id
    WHERE d.asset_id = ${assetId}
      AND d.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    ORDER BY d.created_at DESC`;
  return rows.map(mapDocument);
}

export async function searchDocumentChunks(assetId: string, ownerId: string, query: string) {
  const normalized = query.trim().slice(0, 200);
  if (!normalized) return [];

  const rows = await database()<DocumentSearchRow[]>`
    SELECT
      c.document_id,
      d.title AS document_title,
      c.page_number,
      c.chunk_index,
      p.text_content AS page_text
    FROM document_chunks c
    INNER JOIN documents d ON d.id = c.document_id
    INNER JOIN assets a ON a.id = d.asset_id
    INNER JOIN document_pages p
      ON p.document_id = c.document_id
      AND p.page_number = c.page_number
    WHERE d.asset_id = ${assetId}
      AND d.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
      AND to_tsvector('english', c.text_content) @@ plainto_tsquery('english', ${normalized})
    ORDER BY
      ts_rank(to_tsvector('english', c.text_content), plainto_tsquery('english', ${normalized})) DESC,
      d.title,
      c.page_number,
      c.chunk_index
    LIMIT 24`;

  const seenPages = new Set<string>();
  const results = [];

  for (const row of rows) {
    const pageKey = `${row.document_id}:${row.page_number}`;
    if (seenPages.has(pageKey)) continue;
    seenPages.add(pageKey);
    results.push({
      documentId: row.document_id,
      documentTitle: row.document_title,
      pageNumber: row.page_number,
      chunkIndex: row.chunk_index,
      text: row.page_text,
    });
    if (results.length >= 8) break;
  }

  return results;
}

export async function getDocumentForAsset(documentId: string, assetId: string, ownerId: string) {
  const rows = await database()<DocumentRow[]>`
    SELECT d.id, d.asset_id, d.title, d.original_filename, d.content_type,
      d.size_bytes, d.storage_key, d.created_at, d.extracted_at, d.page_count, d.extraction_error
    FROM documents d
    INNER JOIN assets a ON a.id = d.asset_id
    WHERE d.id = ${documentId}
      AND d.asset_id = ${assetId}
      AND d.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    LIMIT 1`;
  return rows[0] ? mapDocument(rows[0]) : undefined;
}

export async function createDocumentForAsset(assetId: string, ownerId: string, document: NewAssetDocument) {
  const rows = await database()`
    INSERT INTO documents (
      asset_id, owner_id, title, original_filename, content_type, size_bytes, storage_key
    )
    SELECT a.id, a.owner_id, ${document.title}, ${document.originalFilename},
      ${document.contentType}, ${document.sizeBytes}, ${document.storageKey}
    FROM assets a
    WHERE a.id = ${assetId} AND a.owner_id = ${ownerId}
    RETURNING id`;
  return rows.length === 1;
}

export async function replaceDocumentPages(
  documentId: string,
  assetId: string,
  ownerId: string,
  pages: ExtractedDocumentPage[],
) {
  const sql = database();
  const owned = await getDocumentForAsset(documentId, assetId, ownerId);
  if (!owned) return false;
  const chunks = chunkExtractedPages(pages);

  await sql.begin(async (tx) => {
    await tx`DELETE FROM document_chunks WHERE document_id = ${documentId}`;
    await tx`DELETE FROM document_pages WHERE document_id = ${documentId}`;

    for (const page of pages) {
      await tx`
        INSERT INTO document_pages (document_id, page_number, text_content)
        VALUES (${documentId}, ${page.pageNumber}, ${page.text})`;
    }

    for (const chunk of chunks) {
      await tx`
        INSERT INTO document_chunks (document_id, page_number, chunk_index, text_content)
        VALUES (${documentId}, ${chunk.pageNumber}, ${chunk.chunkIndex}, ${chunk.text})`;
    }

    await tx`
      UPDATE documents
      SET extracted_at = now(), page_count = ${pages.length}, extraction_error = NULL
      WHERE id = ${documentId} AND asset_id = ${assetId} AND owner_id = ${ownerId}`;
  });

  return true;
}

export async function markDocumentExtractionError(
  documentId: string,
  assetId: string,
  ownerId: string,
  message: string,
) {
  const rows = await database()`
    UPDATE documents d
    SET extraction_error = ${message}, extracted_at = NULL, page_count = NULL
    FROM assets a
    WHERE d.id = ${documentId}
      AND d.asset_id = ${assetId}
      AND d.owner_id = ${ownerId}
      AND a.id = d.asset_id
      AND a.owner_id = ${ownerId}
    RETURNING d.id`;
  return rows.length === 1;
}
