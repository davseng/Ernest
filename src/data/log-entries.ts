import "server-only";

import type { LogEntryRepository } from "@/data/log-entry-repository";
import { postgresLogEntryRepository } from "@/data/postgres-log-entry-repository";
import type { NewLogEntry } from "@/domain/log-entries";

export function createLogEntryAccess(repository: LogEntryRepository) {
  return {
    getForAsset: (assetId: string, ownerId: string) =>
      repository.findAllByAssetAndOwner(assetId, ownerId),
    createForAsset: (assetId: string, ownerId: string, entry: NewLogEntry) =>
      repository.createForAssetAndOwner(assetId, ownerId, entry),
  };
}

export const { getForAsset: getLogEntries, createForAsset: createLogEntry } =
  createLogEntryAccess(postgresLogEntryRepository);
