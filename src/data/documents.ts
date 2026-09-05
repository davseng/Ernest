import "server-only";

import postgres from "postgres";

import type { AssetDocument, NewAssetDocument } from "@/domain/documents";

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
  };
}

export async function getDocumentsForAsset(assetId: string, ownerId: string) {
  const rows = await database()<DocumentRow[]>`
    SELECT d.id, d.asset_id, d.title, d.original_filename, d.content_type,
      d.size_bytes, d.storage_key, d.created_at
    FROM documents d
    INNER JOIN assets a ON a.id = d.asset_id
    WHERE d.asset_id = ${assetId}
      AND d.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    ORDER BY d.created_at DESC`;
  return rows.map(mapDocument);
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
