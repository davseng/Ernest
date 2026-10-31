import "server-only";
import postgres from "postgres";
import { createSailPhotoStore } from "./sail-photo-store";
let sql: ReturnType<typeof postgres> | undefined;
export function sailPhotos() {
  if (!process.env.DATABASE_URL) throw Error("Database is not configured.");
  return createSailPhotoStore(
    (sql ??= postgres(process.env.DATABASE_URL, { max: 5 })),
  );
}
