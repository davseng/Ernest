import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  sailDatabase,
  OWNER,
  OTHER,
  voyage,
  person,
} from "./helpers/sail-database.mjs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const REF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  PHOTO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function fixture() {
  const f = await sailDatabase();
  await f.db.exec(await readFile("migrations/028_sail_photos.sql", "utf8"));
  await f.db.exec(await readFile("migrations/029_sail_position.sql", "utf8"));
  await f.sql`INSERT INTO assets(id,owner_id,name) VALUES('target',${OWNER},'Destination')`;
  const { createSailPhotoStore } = await loadTypeScript(
      "src/data/sail-photo-store.ts",
    ),
    { createSailPositionStore } = await loadTypeScript(
      "src/data/sail-position-store.ts",
    ),
    { createSailTransferStore } = await loadTypeScript(
      "src/data/sail-transfer-store.ts",
    );
  return {
    ...f,
    photos: createSailPhotoStore(f.sql),
    positions: createSailPositionStore(f.sql),
    transfer: createSailTransferStore(f.sql),
  };
}
const content = () => ({
  format: "sail-content-v1",
  voyages: [{ ...voyage({ published: true }), ref: REF }],
  photos: [
    {
      ref: PHOTO,
      category: "sailing",
      caption: "Sunrise",
      altText: "A sunrise",
      voyageId: REF,
      published: true,
      homeCover: false,
      voyageCover: true,
      position: 4,
    },
  ],
  position: {
    placeLabel: "Harbour",
    reportedOn: "2026-10-30",
    note: "Owner note",
    latitude: 12,
    longitude: -45,
    photoId: PHOTO,
    published: true,
  },
});
async function staged(f, asset = "target", owner = OWNER) {
  const p = await f.photos.prepare(owner, asset, {
    category: "sailing",
    caption: "Sunrise",
  });
  await f.photos.finalize(p.id, owner, async () => ({
    width: 100,
    height: 80,
  }));
  return [{ ref: PHOTO, id: p.id }];
}
test("content import remaps references into owned fresh records and preserves publication, never participants or enquiries", async () => {
  const f = await fixture();
  try {
    await f.transfer.checkEmpty(OWNER, "target");
    const uploads = await staged(f);
    const counts = await f.transfer.importContent(
      OWNER,
      "target",
      content(),
      uploads,
    );
    assert.deepEqual(counts, { voyages: 1, photos: 1, position: true });
    const trips = (await f.store.ownerList(OWNER)).filter(
      (v) => v.assetId === "target",
    );
    assert.equal(trips.length, 1);
    assert.notEqual(trips[0].id, REF);
    assert.equal(trips[0].published, true);
    assert.equal(
      trips[0].crewExpectations,
      content().voyages[0].crewExpectations,
    );
    const pics = (await f.photos.list(OWNER)).filter(
      (p) => p.assetId === "target",
    );
    assert.equal(pics[0].voyageId, trips[0].id);
    assert.equal(pics[0].voyageCover, true);
    assert.equal(pics[0].position, 4);
    assert.equal((await f.positions.publicLatest()).photoId, uploads[0].id);
    for (const table of ["sail_participants", "sail_interest"])
      assert.equal(
        (await f.db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,
        0,
      );
    await assert.rejects(
      () => f.transfer.importContent(OWNER, "target", content(), uploads),
      /already has Sail content/,
    );
    assert.equal((await f.store.ownerList(OWNER)).length, 1);
  } finally {
    await f.db.close();
  }
});
test("import refuses cross-owner assets/photos and existing content, and validation failures leave destination untouched", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      () => f.transfer.checkEmpty(OTHER, "target"),
      /Vessel not found/,
    );
    const uploads = await staged(f, "other", OTHER);
    await assert.rejects(
      () => f.transfer.importContent(OWNER, "target", content(), uploads),
      /already has Sail content/,
    );
    assert.equal((await f.store.ownerList(OWNER)).length, 0);
    const own = await staged(f);
    const bad = content();
    bad.photos[0].voyageId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await assert.rejects(
      () => f.transfer.importContent(OWNER, "target", bad, own),
      /missing voyage/,
    );
    await f.store.save(OWNER, "target", null, voyage());
    await assert.rejects(
      () => f.transfer.importContent(OWNER, "target", content(), own),
      /already has Sail content/,
    );
    assert.equal((await f.photos.owned(own[0].id, OWNER)).published, false);
  } finally {
    await f.db.close();
  }
});
test("a failed import rolls back all plan, audit, photo-publication and position writes", async () => {
  const f = await fixture();
  try {
    const uploads = await staged(f);
    await f.db.exec(
      "ALTER TABLE sail_positions ADD CONSTRAINT synthetic_failure CHECK(place_label<>'Harbour')",
    );
    await assert.rejects(() =>
      f.transfer.importContent(OWNER, "target", content(), uploads),
    );
    assert.equal((await f.store.ownerList(OWNER)).length, 0);
    assert.equal(
      (await f.db.query("SELECT count(*)::int AS n FROM sail_changes")).rows[0]
        .n,
      0,
    );
    assert.equal((await f.photos.owned(uploads[0].id, OWNER)).published, false);
    assert.equal((await f.photos.owned(uploads[0].id, OWNER)).voyageId, null);
  } finally {
    await f.db.close();
  }
});
test("export action projects only owner content, excludes unfinished photos and guest tokens, and derives identity from session", async () => {
  const f = await fixture();
  try {
    const id = await f.store.save(
      OWNER,
      "vessel",
      null,
      voyage({ published: true }),
    );
    await f.store.addPerson(id, OWNER, person());
    const p = await f.photos.prepare(OWNER, "vessel", {
      category: "salon",
      caption: "Cabin",
    });
    await f.photos.finalize(p.id, OWNER, async () => ({
      width: 100,
      height: 100,
    }));
    await f.photos.prepare(OWNER, "vessel", {
      category: "galley",
      caption: "Unfinished",
    });
    let session = { user: { id: OWNER } };
    const actions = await loadTypeScript("src/app/sail/transfer-actions.ts", {
      "@/auth": { auth: async () => session },
      "@/data/assets": {
        getAssets: async (owner) =>
          await f.sql`SELECT id FROM assets WHERE owner_id=${owner}`,
      },
      "@/data/sail": { sail: () => f.store },
      "@/data/sail-photos": { sailPhotos: () => f.photos },
      "@/data/sail-position": { sailPosition: () => f.positions },
      "@/data/sail-transfer": { sailTransfer: () => f.transfer },
    });
    const exported = await actions.exportSailContent("vessel");
    assert.equal(exported.ok, true);
    assert.equal(exported.content.photos.length, 1);
    const text = JSON.stringify(exported.content);
    for (const field of [
      "ownerId",
      "assetId",
      "storageKey",
      "uploadKey",
      "token",
      "guest@example.invalid",
      "Unfinished",
    ])
      assert.equal(text.includes(field), false);
    session = { user: { id: OTHER } };
    assert.equal((await actions.exportSailContent("vessel")).ok, false);
    assert.equal(
      (await actions.importSailContent("target", content(), [])).ok,
      false,
    );
    session = null;
    assert.equal((await actions.checkSailImportTarget("target")).ok, false);
  } finally {
    await f.db.close();
  }
});
test("transfer validation rejects duplicates, absent references and private position photos", async () => {
  const { parseSailTransfer } = await loadTypeScript(
    "src/domain/sail-transfer.ts",
  );
  const c = content();
  c.photos.push({ ...c.photos[0] });
  assert.throws(() => parseSailTransfer(c), /Duplicate/);
  const p = content();
  p.photos[0].published = false;
  assert.throws(() => parseSailTransfer(p), /position photo/);
  assert.throws(
    () => parseSailTransfer({ format: "wrong", voyages: [], photos: [] }),
    /Sail content file/,
  );
  const dirty = {
    ...content(),
    ownerId: OTHER,
    participants: [{ email: "private@example.invalid" }],
  };
  assert.equal("participants" in parseSailTransfer(dirty), false);
});
