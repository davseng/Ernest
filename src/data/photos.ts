import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  client ??= postgres(url, { max: 5 });
  return client;
}

export type PhotoRecord = {
  id: string;
  assetId: string;
  ownerId: string;
  componentId?: string;
  title: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  notes?: string;
  takenAt?: Date;
  createdAt: Date;
};

function mapPhoto(row: {
  id: string; asset_id: string; owner_id: string; component_id: string | null;
  title: string; original_filename: string; content_type: string; size_bytes: number;
  storage_key: string; notes: string | null; taken_at: Date | null; created_at: Date;
}): PhotoRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    ownerId: row.owner_id,
    componentId: row.component_id ?? undefined,
    title: row.title,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
    notes: row.notes ?? undefined,
    takenAt: row.taken_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listPhotos(assetId: string, ownerId: string) {
  const rows = await database()<Array<{
    id: string; asset_id: string; owner_id: string; component_id: string | null;
    title: string; original_filename: string; content_type: string; size_bytes: number;
    storage_key: string; notes: string | null; taken_at: Date | null; created_at: Date;
  }>>`
    SELECT p.*
    FROM photos p
    INNER JOIN assets a ON a.id = p.asset_id
    WHERE p.asset_id = ${assetId}
      AND p.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    ORDER BY p.created_at DESC;
  `;
  return rows.map(mapPhoto);
}

export async function getPhoto(photoId: string, assetId: string, ownerId: string) {
  const rows = await database()<Array<{
    id: string; asset_id: string; owner_id: string; component_id: string | null;
    title: string; original_filename: string; content_type: string; size_bytes: number;
    storage_key: string; notes: string | null; taken_at: Date | null; created_at: Date;
  }>>`
    SELECT p.*
    FROM photos p
    INNER JOIN assets a ON a.id = p.asset_id
    WHERE p.id = ${photoId}
      AND p.asset_id = ${assetId}
      AND p.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    LIMIT 1;
  `;
  return rows[0] ? mapPhoto(rows[0]) : undefined;
}

export async function createPhoto(assetId: string, ownerId: string, input: {
  title: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  componentId?: string;
  notes?: string;
}) {
  const rows = await database()<Array<{ id: string }>>`
    INSERT INTO photos (
      asset_id, owner_id, component_id, title, original_filename,
      content_type, size_bytes, storage_key, notes
    )
    SELECT a.id, a.owner_id, c.id, ${input.title}, ${input.originalFilename},
      ${input.contentType}, ${input.sizeBytes}, ${input.storageKey}, ${input.notes ?? null}
    FROM assets a
    LEFT JOIN components c ON c.id = ${input.componentId ?? null}
      AND EXISTS (
        SELECT 1 FROM systems s
        WHERE s.id = c.system_id AND s.asset_id = a.id
      )
    WHERE a.id = ${assetId}
      AND a.owner_id = ${ownerId}
      AND (${input.componentId ?? null}::text IS NULL OR c.id IS NOT NULL)
    RETURNING id;
  `;
  return rows[0]?.id;
}

export async function updatePhoto(photoId: string, assetId: string, ownerId: string, input: {
  title: string;
  componentId?: string;
  notes?: string;
}) {
  const rows = await database()<Array<{ id: string }>>`
    UPDATE photos p
    SET title = ${input.title},
        component_id = ${input.componentId ?? null},
        notes = ${input.notes ?? null}
    FROM assets a
    WHERE p.id = ${photoId}
      AND p.asset_id = ${assetId}
      AND p.owner_id = ${ownerId}
      AND a.id = p.asset_id
      AND a.owner_id = ${ownerId}
      AND (
        ${input.componentId ?? null}::text IS NULL OR EXISTS (
          SELECT 1
          FROM components c
          INNER JOIN systems s ON s.id = c.system_id
          WHERE c.id = ${input.componentId ?? null}
            AND s.asset_id = ${assetId}
        )
      )
    RETURNING p.id;
  `;
  return rows.length === 1;
}

export async function deletePhotoRecord(photoId: string, assetId: string, ownerId: string) {
  const rows = await database()<Array<{ id: string }>>`
    DELETE FROM photos p
    USING assets a
    WHERE p.id = ${photoId}
      AND p.asset_id = ${assetId}
      AND p.owner_id = ${ownerId}
      AND a.id = p.asset_id
      AND a.owner_id = ${ownerId}
    RETURNING p.id;
  `;
  return rows.length === 1;
}
