import "server-only";

import postgres from "postgres";

const LOG_TYPES = new Set(["note", "maintenance", "passage", "observation", "incident"]);

export type OfflineLogUploadEntry = {
  clientMutationId: string;
  idempotencyKey: string;
  attempts: number;
  payload: {
    assetId: string;
    occurredAt: string;
    entryType: string;
    title: string;
    body: string;
    source?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
};

export type OfflineLogUploadBatch = {
  protocolVersion: number;
  kind: string;
  direction: string;
  generatedAt: string;
  assetId: string | null;
  uploadEnabled?: boolean;
  entries: OfflineLogUploadEntry[];
};

type ValidatedOfflineLog = {
  id: string;
  assetId: string;
  occurredAt: string;
  entryType: string;
  title: string;
  body: string;
  source: "manual";
  latitude: number | null;
  longitude: number | null;
};

let client: ReturnType<typeof postgres> | undefined;

function database() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  client ??= postgres(databaseUrl, { max: 5 });
  return client;
}

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function optionalCoordinate(value: unknown, label: "latitude" | "longitude") {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number.`);
  const limit = label === "latitude" ? 90 : 180;
  if (parsed < -limit || parsed > limit) throw new Error(`${label} is outside the valid range.`);
  return parsed;
}

export function validateOfflineLogUploadBatch(input: OfflineLogUploadBatch, expectedAssetId: string): ValidatedOfflineLog[] {
  if (input?.protocolVersion !== 1) throw new Error("Unsupported Boat-to-Cloud protocol version.");
  if (input?.kind !== "operating-log-batch") throw new Error("Unsupported Boat-to-Cloud batch kind.");
  if (input?.direction !== "boat-to-cloud") throw new Error("Invalid Boat-to-Cloud direction.");

  const assetId = requiredText(input.assetId, "assetId");
  if (assetId !== expectedAssetId) throw new Error("Upload batch belongs to a different asset.");
  if (!Array.isArray(input.entries)) throw new Error("entries must be an array.");

  const seen = new Set<string>();
  return input.entries.map((entry) => {
    const clientMutationId = requiredText(entry?.clientMutationId, "clientMutationId");
    const idempotencyKey = requiredText(entry?.idempotencyKey, "idempotencyKey");
    if (clientMutationId !== idempotencyKey) throw new Error("idempotencyKey must equal clientMutationId.");
    if (seen.has(clientMutationId)) throw new Error("Duplicate clientMutationId in upload batch.");
    seen.add(clientMutationId);

    const payloadAssetId = requiredText(entry?.payload?.assetId, "payload.assetId");
    if (payloadAssetId !== assetId) throw new Error("Log entry belongs to a different asset.");

    const occurredAt = requiredText(entry?.payload?.occurredAt, "occurredAt");
    if (Number.isNaN(new Date(occurredAt).getTime())) throw new Error("occurredAt must be a valid date/time.");

    const entryType = requiredText(entry?.payload?.entryType, "entryType").toLowerCase();
    if (!LOG_TYPES.has(entryType)) throw new Error(`Unsupported log entry type: ${entryType}.`);

    return {
      id: clientMutationId,
      assetId,
      occurredAt: new Date(occurredAt).toISOString(),
      entryType,
      title: requiredText(entry?.payload?.title, "title"),
      body: requiredText(entry?.payload?.body, "body"),
      source: "manual" as const,
      latitude: optionalCoordinate(entry?.payload?.latitude, "latitude"),
      longitude: optionalCoordinate(entry?.payload?.longitude, "longitude"),
    };
  });
}

export async function persistOfflineLogBatchForOwner(input: OfflineLogUploadBatch, assetId: string, ownerId: string) {
  const entries = validateOfflineLogUploadBatch(input, assetId);
  const sql = database();
  const results = [];

  for (const entry of entries) {
    const rows = await sql<{ id: string; inserted: boolean }[]>`
      WITH owned_asset AS (
        SELECT id FROM assets WHERE id = ${assetId} AND owner_id = ${ownerId}
      ), inserted AS (
        INSERT INTO log_entries
          (id, asset_id, author_user_id, occurred_at, entry_type, title, body, source, latitude, longitude)
        SELECT ${entry.id}::uuid, oa.id, ${ownerId}, ${entry.occurredAt}, ${entry.entryType}, ${entry.title},
          ${entry.body}, ${entry.source}, ${entry.latitude}, ${entry.longitude}
        FROM owned_asset oa
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      )
      SELECT id, true AS inserted FROM inserted
      UNION ALL
      SELECT le.id, false AS inserted
      FROM log_entries le
      INNER JOIN owned_asset oa ON oa.id = le.asset_id
      WHERE le.id = ${entry.id}::uuid AND NOT EXISTS (SELECT 1 FROM inserted)
      LIMIT 1`;

    if (!rows[0]) throw new Error("Asset not found, not owned by the current user, or idempotency key conflicts with another asset.");
    results.push({ clientMutationId: entry.id, cloudId: rows[0].id, status: rows[0].inserted ? "created" : "already-exists" });
  }

  return { protocolVersion: 1, kind: "operating-log-batch-result", assetId, results };
}
