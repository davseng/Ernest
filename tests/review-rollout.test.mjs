import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
async function baseline() {
  const db = new PGlite();
  for (const f of (await readdir("migrations"))
    .filter(
      (f) => f.endsWith(".sql") && f < "026" && f !== "022_boat_devices.sql",
    )
    .sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
  return db;
}
test("026 owner-run bundle applies only additive review schema, preserves legacy rows and refuses replay", async () => {
  const db = await baseline();
  try {
    const source = await readFile(
      "scripts/v012/sql-editor/02-apply-026.sql",
      "utf8",
    );
    assert.equal(
      source
        .split("-- BEGIN UNCHANGED MIGRATION 026\n")[1]
        .split("-- END UNCHANGED MIGRATION 026")[0],
      await readFile("migrations/026_simplified_review.sql", "utf8"),
    );
    const before = (await db.query("SELECT count(*)::int AS n FROM users"))
      .rows[0].n;
    await db.exec(
      await readFile("scripts/v012/sql-editor/01-preflight.sql", "utf8"),
    );
    const script = source.replace(
      "current_database()<>'neondb'",
      "current_database()<>current_database()",
    );
    await db.exec(script);
    await db.exec(
      await readFile("scripts/v012/sql-editor/03-verify.sql", "utf8"),
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM users")).rows[0].n,
      before,
    );
    assert.deepEqual(
      (await db.query("SELECT name FROM schema_migrations")).rows,
      [{ name: "026_simplified_review.sql" }],
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM maintenance_events"))
        .rows[0].n,
      0,
    );
    await assert.rejects(() => db.exec(script), /already exists/);
    await db.exec("ROLLBACK");
  } finally {
    await db.close();
  }
});
test("026 bundle refuses an unrecognized database or partial review schema without leaving new tables", async () => {
  const db = await baseline();
  try {
    const source = await readFile(
      "scripts/v012/sql-editor/02-apply-026.sql",
      "utf8",
    );
    await assert.rejects(
      () => db.exec(source.replace("current_database()<>'neondb'", "true")),
      /Unexpected database/,
    );
    await db.exec("ROLLBACK");
    assert.equal(
      (
        await db.query(
          "SELECT to_regclass('public.update_reviews') AS relation",
        )
      ).rows[0].relation,
      null,
    );
    await db.exec(
      "ALTER TABLE conversation_messages ADD COLUMN review_id uuid",
    );
    await assert.rejects(
      () =>
        db.exec(
          source.replace(
            "current_database()<>'neondb'",
            "current_database()<>current_database()",
          ),
        ),
      /review_id already exists/,
    );
    await db.exec("ROLLBACK");
    assert.equal(
      (
        await db.query(
          "SELECT to_regclass('public.maintenance_events') AS relation",
        )
      ).rows[0].relation,
      null,
    );
  } finally {
    await db.close();
  }
});
