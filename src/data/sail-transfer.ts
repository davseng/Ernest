import "server-only";
import postgres from "postgres";
import { createSailTransferStore } from "./sail-transfer-store";
let sql: ReturnType<typeof postgres> | undefined;
export function sailTransfer() {
  if (!process.env.DATABASE_URL) throw Error("Database is not configured.");
  return createSailTransferStore(
    (sql ??= postgres(process.env.DATABASE_URL, { max: 5 })),
  );
}
