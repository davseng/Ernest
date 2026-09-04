import "server-only";

import postgres from "postgres";

import type { LogEntryRepository } from "@/data/log-entry-repository";
import type { LogEntry, LogEntrySource, LogEntryType } from "@/domain/log-entries";

type LogEntryRow = {
  id: string; asset_id: string; author_user_id: string | null; occurred_at: Date; created_at: Date;
  entry_type: LogEntryType; title: string; body: string; source: LogEntrySource;
  latitude: number | null; longitude: number | null;
};

let client: ReturnType<typeof postgres> | undefined;

function database() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  client ??= postgres(databaseUrl, { max: 5 });
  return client;
}

function mapRow(row: LogEntryRow): LogEntry {
  return {
    id: row.id, assetId: row.asset_id, authorUserId: row.author_user_id ?? undefined,
    occurredAt: row.occurred_at, createdAt: row.created_at, entryType: row.entry_type,
    title: row.title, body: row.body, source: row.source,
    latitude: row.latitude ?? undefined, longitude: row.longitude ?? undefined,
  };
}

export const postgresLogEntryRepository: LogEntryRepository = {
  async findAllByAssetAndOwner(assetId, ownerId) {
    const rows = await database()<LogEntryRow[]>`
      SELECT le.* FROM log_entries le
      INNER JOIN assets a ON a.id = le.asset_id
      WHERE le.asset_id = ${assetId} AND a.owner_id = ${ownerId}
      ORDER BY le.occurred_at DESC, le.created_at DESC`;
    return rows.map(mapRow);
  },
  async createForAssetAndOwner(assetId, ownerId, entry) {
    const rows = await database()<LogEntryRow[]>`
      INSERT INTO log_entries
        (asset_id, author_user_id, occurred_at, entry_type, title, body, source, latitude, longitude)
      SELECT a.id, ${ownerId}, ${entry.occurredAt}, ${entry.entryType}, ${entry.title}, ${entry.body},
        'manual', ${entry.latitude ?? null}, ${entry.longitude ?? null}
      FROM assets a WHERE a.id = ${assetId} AND a.owner_id = ${ownerId}
      RETURNING *`;
    return rows[0] ? mapRow(rows[0]) : undefined;
  },
};
