import "server-only";

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

export function validateOfflineLogUploadBatch(input: OfflineLogUploadBatch, expectedAssetId: string) {
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
      // Future ingestion can use this UUID directly as log_entries.id. PostgreSQL's
      // primary key then becomes the idempotency boundary without another migration.
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
