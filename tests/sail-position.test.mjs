import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  sailDatabase,
  OWNER,
  OTHER,
  voyage,
} from "./helpers/sail-database.mjs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const report = (overrides = {}) => ({
  placeLabel: "Test harbour",
  reportedOn: "2026-10-30",
  latitude: 35,
  longitude: -76,
  note: "Synthetic family update",
  photoId: null,
  published: false,
  ...overrides,
});
async function fixture() {
  const f = await sailDatabase();
  await f.db.exec(await readFile("migrations/028_sail_photos.sql", "utf8"));
  await f.db.exec(await readFile("migrations/029_sail_position.sql", "utf8"));
  const { createSailPositionStore } = await loadTypeScript(
      "src/data/sail-position-store.ts",
    ),
    { createSailPhotoStore } = await loadTypeScript(
      "src/data/sail-photo-store.ts",
    );
  return {
    ...f,
    position: createSailPositionStore(f.sql),
    photos: createSailPhotoStore(f.sql),
  };
}
test("reported position validates actual dates and complete finite coordinates, allowing a place-only report", async () => {
  const { parseSailPosition } = await loadTypeScript(
    "src/domain/sail-position.ts",
  );
  assert.equal(
    parseSailPosition(report({ latitude: null, longitude: null })).latitude,
    null,
  );
  for (const p of [
    { latitude: 91 },
    { longitude: 181 },
    { latitude: NaN },
    { latitude: Infinity },
    { latitude: true },
    { longitude: null },
    { reportedOn: "2026-02-30" },
    { reportedOn: "2999-01-01" },
    { placeLabel: "" },
    { photoId: "not-a-photo" },
  ])
    assert.throws(() => parseSailPosition(report(p)));
});
test("position reports stay private until the owner publishes; stale and cross-owner changes fail", async () => {
  const { db, position } = await fixture();
  try {
    assert.equal(await position.publicLatest(), null);
    await position.save(OWNER, "vessel", report(), 0);
    assert.equal(await position.publicLatest(), null);
    assert.deepEqual(await position.ownerList(OTHER), []);
    await assert.rejects(
      () => position.save(OTHER, "vessel", report({ published: true }), 1),
      /not found/,
    );
    await assert.rejects(
      () => position.save(OWNER, "vessel", report({ published: true }), 0),
      /changed/,
    );
    await position.save(OWNER, "vessel", report({ published: true }), 1);
    const p = await position.publicLatest();
    assert.equal(p.placeLabel, "Test harbour");
    assert.equal(p.reportedOn, "2026-10-30");
    for (const key of ["ownerId", "assetId", "revision", "updatedAt"])
      assert.equal(Object.hasOwn(p, key), false);
    await position.save(OWNER, "vessel", report({ published: false }), 2);
    assert.equal(await position.publicLatest(), null);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM sail_positions")).rows[0]
        .n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("position photographs must be published and owned, and disappear from the report when unpublished", async () => {
  const { db, position, photos, store } = await fixture();
  try {
    const p = await photos.prepare(OWNER, "vessel", {
      category: "sailing",
      caption: "A synthetic moment",
    });
    await photos.finalize(p.id, OWNER, async () => ({
      width: 100,
      height: 100,
    }));
    await assert.rejects(
      () =>
        position.save(
          OWNER,
          "vessel",
          report({ photoId: p.id, published: true }),
          0,
        ),
      /published photo/,
    );
    await photos.update(
      p.id,
      OWNER,
      { category: "sailing", caption: "A synthetic moment", published: true },
      1,
    );
    await position.save(
      OWNER,
      "vessel",
      report({ photoId: p.id, published: true }),
      0,
    );
    assert.equal((await position.publicLatest()).photoId, p.id);
    await photos.update(
      p.id,
      OWNER,
      { category: "sailing", caption: "A synthetic moment", published: false },
      2,
    );
    assert.equal((await position.publicLatest()).photoId, null);
    const vid = await store.save(OWNER, "vessel", null, voyage());
    const privateTrip = await photos.prepare(OWNER, "vessel", {
      category: "sailing",
      caption: "Private trip",
      voyageId: vid,
    });
    await photos.finalize(privateTrip.id, OWNER, async () => ({
      width: 100,
      height: 100,
    }));
    await photos.update(
      privateTrip.id,
      OWNER,
      {
        category: "sailing",
        caption: "Private trip",
        voyageId: vid,
        published: true,
      },
      1,
    );
    await assert.rejects(
      () =>
        position.save(
          OWNER,
          "vessel",
          report({ photoId: privateTrip.id, published: true }),
          1,
        ),
      /published photo/,
    );
  } finally {
    await db.close();
  }
});
test("position action derives the owner and publishes only the submitted report; no updates to operating logs or voyages", async () => {
  const { db, position, store } = await fixture();
  let session = null;
  try {
    const id = await store.save(OWNER, "vessel", null, voyage());
    const actions = await loadTypeScript("src/app/sail/position-actions.ts", {
      "@/auth": { auth: async () => session },
      "@/data/sail-position": { sailPosition: () => position },
      "next/cache": { revalidatePath() {} },
    });
    assert.equal(
      (await actions.saveSailPosition("vessel", report(), 0)).ok,
      false,
    );
    session = { user: { id: OWNER } };
    const result = await actions.saveSailPosition(
      "vessel",
      { ...report({ published: true }), ownerId: OTHER },
      0,
    );
    assert.equal(result.ok, true);
    assert.equal(result.revision, 1);
    assert.equal((await store.ownerVoyage(id, OWNER)).revision, 1);
    assert.equal((await position.ownerList(OWNER)).length, 1);
  } finally {
    await db.close();
  }
});
test("public joining copy never publishes private crew guidance and carries only a role preference to enquiries", async () => {
  const { db, store, photos } = await fixture();
  try {
    const id = await store.save(
      OWNER,
      "vessel",
      null,
      voyage({ published: true }),
    );
    const Link = ({ href, children, ...props }) =>
      createElement("a", { href, ...props }, children);
    const Page = await loadTypeScript("src/app/sail/join/page.tsx", {
      "@/data/sail": { sail: () => store },
      "@/data/sail-photos": { sailPhotos: () => photos },
      "next/link": { default: Link },
    });
    const html = renderToStaticMarkup(
      await Page.default({
        searchParams: Promise.resolve({ as: "passenger" }),
      }),
    );
    assert.equal(html.includes("Crew-only guidance"), false);
    assert.equal(html.includes("Passenger-only guidance"), false);
    assert.ok(html.includes(`/sail/voyages/${id}?as=passenger#enquiry`));
    assert.ok(html.includes("Friends &amp; family aboard"));
    const Detail = await loadTypeScript(
      "src/app/sail/voyages/[voyageId]/page.tsx",
      {
        "@/data/sail": { sail: () => store },
        "@/data/sail-photos": { sailPhotos: () => photos },
        "next/navigation": {
          notFound() {
            throw Error("Not found");
          },
        },
        "@/components/sail/interest-form": {
          SailInterestForm: ({ preferredRole }) =>
            createElement("span", null, "Selected:" + preferredRole),
        },
      },
    );
    assert.ok(
      renderToStaticMarkup(
        await Detail.default({
          params: Promise.resolve({ voyageId: id }),
          searchParams: Promise.resolve({ as: "passenger" }),
        }),
      ).includes("Selected:passenger"),
    );
  } finally {
    await db.close();
  }
});
test("position rollout is additive and refuses unrecognised targets and replay", async () => {
  const { db } = await sailDatabase();
  try {
    await db.exec(await readFile("migrations/028_sail_photos.sql", "utf8"));
    const source = await readFile(
      "scripts/sail/position-sql-editor/02-apply-029.sql",
      "utf8",
    );
    assert.equal(
      source
        .split("-- BEGIN UNCHANGED MIGRATION 029\n")[1]
        .split("-- END UNCHANGED MIGRATION 029")[0],
      await readFile("migrations/029_sail_position.sql", "utf8"),
    );
    await assert.rejects(
      () => db.exec(source.replace("current_database()<>'neondb'", "true")),
      /Unexpected database/,
    );
    await db.exec("ROLLBACK");
    const script = source.replace(
      "current_database()<>'neondb'",
      "current_database()<>current_database()",
    );
    await db.exec(script);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM assets")).rows[0].n,
      2,
    );
    await db.exec(
      await readFile("scripts/sail/position-sql-editor/03-verify.sql", "utf8"),
    );
    await assert.rejects(() => db.exec(script), /already exists/);
    await db.exec("ROLLBACK");
  } finally {
    await db.close();
  }
});
