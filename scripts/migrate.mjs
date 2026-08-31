import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "./database.mjs";

const sql = connect();
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map(({ name }) => name));
  for (const name of (await readdir("migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    const migration = await readFile(path.join("migrations", name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    console.log(`Applied ${name}`);
  }
} finally { await sql.end(); }
