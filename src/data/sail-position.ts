import "server-only";
import postgres from "postgres";
import { createSailPositionStore } from "./sail-position-store";
let client: ReturnType<typeof postgres> | undefined;
export function sailPosition() {
  if (!process.env.DATABASE_URL) throw Error("Database is not configured.");
  return createSailPositionStore(
    (client ??= postgres(process.env.DATABASE_URL, { max: 5 })),
  );
}
