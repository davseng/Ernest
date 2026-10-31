import "server-only";
import postgres from "postgres";
import { createSailStore } from "./sail-store";
let client: ReturnType<typeof postgres> | undefined;
export function sail() {
  if (!process.env.DATABASE_URL) throw Error("Database is not configured.");
  return createSailStore(
    (client ??= postgres(process.env.DATABASE_URL, { max: 5 })),
  );
}
