import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { loadTypeScript } from "./load-typescript.mjs";
export const OWNER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222";
export const ITEM = "33333333-3333-4333-8333-333333333333",
  SURVEY = "44444444-4444-4444-8444-444444444444",
  WORK = "55555555-5555-4555-8555-555555555555",
  FOREIGN = "66666666-6666-4666-8666-666666666666";
export function adapt(conn) {
  const sql = async (strings, ...values) =>
    (
      await conn.query(
        strings.reduce((s, t, i) => s + (i ? `$${i}` : "") + t, ""),
        values,
      )
    ).rows;
  sql.begin = (fn) => conn.transaction((tx) => fn(adapt(tx)));
  sql.json = (value) => JSON.stringify(value);
  sql.unsafe = async (query, values = []) =>
    (await conn.query(query, values)).rows;
  return sql;
}
export async function reviewDatabase() {
  const db = new PGlite();
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql") && f !== "022_boat_devices.sql")
    .sort())
    await db.exec(await readFile("migrations/" + file, "utf8"));
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [OWNER, OTHER]);
  await db.query(
    "INSERT INTO assets(id,owner_id,name,type,make,model,year,summary) VALUES('vessel',$1,'Synthetic','Boat','','',2020,''),('other',$2,'Other','Boat','','',2020,'')",
    [OWNER, OTHER],
  );
  await db.exec(
    "INSERT INTO systems(id,asset_id,name,description) VALUES('engine-system','vessel','Engine',''); INSERT INTO components(id,system_id,name,manufacturer,model,location,notes) VALUES('pump','engine-system','Raw-water pump','','','','');",
  );
  await db.query(
    "INSERT INTO inventory_items(id,asset_id,owner_id,name,quantity) VALUES($1,'vessel',$2,'Impeller',3)",
    [ITEM, OWNER],
  );
  for (const [id, asset, owner, title] of [
    [SURVEY, "vessel", OWNER, "Survey"],
    [WORK, "vessel", OWNER, "Yard work order"],
    [FOREIGN, "other", OTHER, "Other survey"],
  ]) {
    await db.query(
      "INSERT INTO documents(id,asset_id,owner_id,title,original_filename,content_type,size_bytes,storage_key,page_count) VALUES($1,$2,$3,$4,'synthetic.pdf','application/pdf',20,$5,2)",
      [id, asset, owner, title, `synthetic-${id}`],
    );
    await db.query(
      "INSERT INTO document_pages(document_id,page_number,text_content) VALUES($1,1,$2),($1,2,$3)",
      [
        id,
        "A1 Deck core at mast. A2 Deck core at windlass. B1 Forward head hose odor.",
        "Replacement of forward head hoses completed.",
      ],
    );
  }
  const sql = adapt(db);
  const { createReviewStore } = await loadTypeScript(
    "src/data/review-store.ts",
  );
  return { db, sql, store: createReviewStore(sql) };
}
export function maintenance(extra = {}) {
  return {
    id: "event",
    kind: "maintenance",
    include: true,
    evidence: [],
    reason: "Owner statement",
    eventId: null,
    expectedRevision: null,
    title: "Impeller replacement",
    description: "Replaced the impeller with one from current spares.",
    date: "2026-10-22",
    componentId: "pump",
    engineHours: null,
    spareItemId: ITEM,
    spareUsed: "1",
    deductSpare: true,
    expectedQuantity: "3",
    allowDuplicate: false,
    ...extra,
  };
}
export function draft(rows, extra = {}) {
  return {
    title: "Review maintenance",
    summary: "Owner decides which changes are definitive.",
    missing: ["Engine hours are unknown; optional."],
    coverage: "",
    rows,
    ...extra,
  };
}
