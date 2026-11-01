import "server-only";
import postgres from "postgres";
import { createSailTimelineStore } from "./sail-timeline-store";
let sql: ReturnType<typeof postgres> | undefined;
export function sailTimeline() {
  if (!process.env.DATABASE_URL) throw Error("Database is not configured.");
  return createSailTimelineStore(
    (sql ??= postgres(process.env.DATABASE_URL, { max: 5 })),
  );
}
