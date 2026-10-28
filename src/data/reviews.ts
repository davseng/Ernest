import "server-only";
import postgres from "postgres";
import { createReviewStore } from "./review-store";
let sql: ReturnType<typeof postgres> | undefined;
export function reviews() {
  if (!process.env.DATABASE_URL) throw Error("Database is not configured.");
  return createReviewStore(
    (sql ??= postgres(process.env.DATABASE_URL, { max: 5 })),
  );
}
