import postgres from "postgres";

export function connect() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return postgres(process.env.DATABASE_URL, { max: 1 });
}
