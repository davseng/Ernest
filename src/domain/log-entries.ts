export const logEntryTypes = ["note", "maintenance", "passage", "observation", "incident"] as const;
export type LogEntryType = (typeof logEntryTypes)[number];

export const logEntrySources = ["manual", "system", "imported"] as const;
export type LogEntrySource = (typeof logEntrySources)[number];

export interface LogEntry {
  id: string;
  assetId: string;
  authorUserId?: string;
  occurredAt: Date;
  createdAt: Date;
  entryType: LogEntryType;
  title: string;
  body: string;
  source: LogEntrySource;
  latitude?: number;
  longitude?: number;
}

export interface NewLogEntry {
  occurredAt: Date;
  entryType: LogEntryType;
  title: string;
  body: string;
  latitude?: number;
  longitude?: number;
}
