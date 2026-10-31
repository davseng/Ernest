import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { loadTypeScript } from "./load-typescript.mjs";
import { adapt, OWNER, OTHER } from "./review-database.mjs";
export { OWNER, OTHER };
export async function sailDatabase() {
  const db = new PGlite();
  await db.exec(
    "CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE assets(id text PRIMARY KEY,owner_id uuid REFERENCES users(id),name text NOT NULL);",
  );
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [OWNER, OTHER]);
  await db.query(
    "INSERT INTO assets(id,owner_id,name) VALUES('vessel',$1,'Test vessel'),('other',$2,'Other vessel')",
    [OWNER, OTHER],
  );
  await db.exec(await readFile("migrations/027_sail_far_better.sql", "utf8"));
  const sql = adapt(db);
  const { createSailStore } = await loadTypeScript("src/data/sail-store.ts");
  return { db, sql, store: createSailStore(sql) };
}
export const voyage = (overrides = {}) => ({
  title: "Coastal passage",
  summary: "A synthetic acceptance voyage.",
  departurePort: "Port A",
  arrivalPort: "Port B",
  departureFrom: "2026-11-10",
  departureTo: "2026-11-15",
  arrivalEstimate: "2026-11-18",
  timingNote: "Waiting for a suitable weather window.",
  status: "planning",
  published: false,
  crewExpectations: "Crew-only guidance: discuss watches.",
  passengerExpectations: "Passenger-only guidance: discuss life aboard.",
  boardingNotes: "Private joining location.",
  ...overrides,
});
export const person = (overrides = {}) => ({
  fullName: "Test invitee",
  email: "guest@example.invalid",
  role: "crew",
  ...overrides,
});
