import "server-only";

import type { LogEntry, NewLogEntry } from "@/domain/log-entries";

export interface LogEntryRepository {
  findAllByAssetAndOwner(assetId: string, ownerId: string): Promise<LogEntry[]>;
  createForAssetAndOwner(assetId: string, ownerId: string, entry: NewLogEntry): Promise<LogEntry | undefined>;
}
