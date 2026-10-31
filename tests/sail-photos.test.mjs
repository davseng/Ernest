import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  sailDatabase,
  OWNER,
  OTHER,
  voyage,
} from "./helpers/sail-database.mjs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
async function fixture() {
  const f = await sailDatabase();
  await f.db.exec(await readFile("migrations/028_sail_photos.sql", "utf8"));
  const { createSailPhotoStore } = await loadTypeScript(
    "src/data/sail-photo-store.ts",
  );
  return { ...f, photos: createSailPhotoStore(f.sql) };
}
const details = (overrides = {}) => ({
  category: "exterior",
  caption: "Far Better alongside the dock",
  altText: "A sailboat at the dock",
  position: 0,
  ...overrides,
});
test("website photos require owner publication and cannot reuse private Ernest storage keys", async () => {
  const { db, photos } = await fixture();
  try {
    await assert.rejects(
      () => photos.prepare(OTHER, "vessel", details()),
      /not found/,
    );
    const p = await photos.prepare(
      OWNER,
      "vessel",
      details({
        storageKey: "private-evidence-key",
        published: true,
        homeCover: true,
      }),
    );
    assert.match(p.uploadKey, /^sail-uploads\//);
    assert.match(p.storageKey, /^sail-public\//);
    assert.notEqual(p.storageKey, "private-evidence-key");
    assert.equal(await photos.owned(p.id, OTHER), null);
    assert.equal((await photos.publicPhotos()).length, 0);
    await assert.rejects(
      () => photos.update(p.id, OWNER, details({ published: true }), 1),
      /Finish uploading/,
    );
    let writes = 0;
    await photos.finalize(p.id, OWNER, async () => {
      writes++;
      return { width: 1200, height: 800 };
    });
    await photos.finalize(p.id, OWNER, async () => {
      throw Error("must not rewrite a published candidate");
    });
    assert.equal(writes, 1);
    await photos.update(
      p.id,
      OWNER,
      details({ published: true, homeCover: true }),
      1,
    );
    const pub = (await photos.publicPhotos())[0];
    assert.equal(pub.homeCover, true);
    for (const key of ["ownerId", "assetId", "storageKey", "uploadKey"])
      assert.equal(Object.hasOwn(pub, key), false);
    assert.equal((await photos.published(p.id)).storageKey, p.storageKey);
    await assert.rejects(
      () => photos.update(p.id, OTHER, details({ published: true }), 2),
      /not found/,
    );
    await assert.rejects(
      () => photos.update(p.id, OWNER, details({ published: false }), 1),
      /changed/,
    );
    await photos.update(p.id, OWNER, details({ published: false }), 2);
    assert.equal(await photos.published(p.id), null);
    await photos.remove(p.id, OWNER, 3);
    assert.equal(await photos.owned(p.id, OWNER), null);
  } finally {
    await db.close();
  }
});
test("website voyage photos follow voyage publication and cover selection is exclusive", async () => {
  const { db, photos, store } = await fixture();
  try {
    const vid = await store.save(OWNER, "vessel", null, voyage());
    const p = await photos.prepare(OWNER, "vessel", details({ voyageId: vid }));
    await photos.finalize(p.id, OWNER, async () => ({
      width: 100,
      height: 100,
    }));
    await photos.update(
      p.id,
      OWNER,
      details({ voyageId: vid, published: true, voyageCover: true }),
      1,
    );
    assert.equal(await photos.published(p.id), null);
    assert.equal((await photos.publicPhotos(vid)).length, 0);
    assert.equal((await photos.publicCovers()).length, 0);
    await store.save(OWNER, "vessel", vid, voyage({ published: true }), 1);
    assert.equal((await photos.publicPhotos(vid)).length, 1);
    assert.equal((await photos.publicPhotos()).length, 0);
    const next = await photos.prepare(
      OWNER,
      "vessel",
      details({ voyageId: vid }),
    );
    await photos.finalize(next.id, OWNER, async () => ({
      width: 100,
      height: 100,
    }));
    await photos.update(
      next.id,
      OWNER,
      details({ voyageId: vid, published: true, voyageCover: true }),
      1,
    );
    assert.equal((await photos.publicCovers()).length, 1);
    assert.equal((await photos.publicCovers())[0].id, next.id);
    await store.save(OWNER, "vessel", vid, voyage({ published: false }), 2);
    assert.equal(await photos.published(next.id), null);
    const other = await store.save(OTHER, "other", null, voyage());
    await assert.rejects(
      () => photos.prepare(OWNER, "vessel", details({ voyageId: other })),
      /this vessel/,
    );
  } finally {
    await db.close();
  }
});
test("photo processing checks bytes, bounds dimensions, orients portraits and strips metadata", async () => {
  const { prepareSailWebPhoto } = await loadTypeScript(
    "src/data/sail-photo-image.ts",
  );
  const source = await sharp({
    create: { width: 2500, height: 1200, channels: 3, background: "#cc8844" },
  })
    .jpeg()
    .withMetadata({
      orientation: 6,
      exif: { IFD0: { Artist: "private metadata" } },
    })
    .toBuffer();
  assert.ok((await sharp(source).metadata()).exif);
  const web = await prepareSailWebPhoto(source),
    meta = await sharp(web.bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
  assert.ok(web.height > web.width);
  assert.ok(web.height <= 2000 && web.width <= 2000);
  await assert.rejects(
    () =>
      prepareSailWebPhoto(
        Buffer.from(
          '<svg><image href="https://untrusted.invalid/secret"/></svg>',
        ),
      ),
    /genuine/,
  );
  await assert.rejects(
    () => prepareSailWebPhoto(Buffer.alloc(11 * 1024 * 1024)),
    /10 MB/,
  );
});
test("photo actions use owned upload tickets, publish only normalised copies, and expose no credentials", async () => {
  const { db, photos } = await fixture();
  let session = { user: { id: OWNER } },
    reads = 0;
  const files = new Map();
  try {
    let failSigning = false;
    const storage = {
      createDocumentUploadUrl: async (key) => {
        if (failSigning) throw Error("synthetic private provider detail");
        return "https://synthetic.invalid/upload/" + key;
      },
      inspectDocument: async (key) => ({
        sizeBytes: files.get(key)?.length ?? 0,
      }),
      readStoredUpload: async (key) => {
        reads++;
        return files.get(key);
      },
      storeDocumentBytes: async (key, bytes, type) => {
        assert.equal(type, "image/webp");
        files.set(key, bytes);
      },
      deleteStoredDocument: async (key) => {
        files.delete(key);
      },
    };
    const actions = await loadTypeScript("src/app/sail/photo-actions.ts", {
      "@/auth": { auth: async () => session },
      "@/data/sail-photos": { sailPhotos: () => photos },
      "@/data/document-storage": storage,
      "next/cache": { revalidatePath() {} },
    });
    session = null;
    assert.equal(
      (await actions.startSailPhoto("vessel", details(), "image/jpeg", 100)).ok,
      false,
    );
    session = { user: { id: OWNER } };
    const p = await actions.startSailPhoto(
      "vessel",
      details(),
      "image/jpeg",
      100,
    );
    assert.equal(p.ok, true);
    const raw = await photos.owned(p.id, OWNER);
    files.set(
      raw.uploadKey,
      await sharp({
        create: { width: 50, height: 40, channels: 3, background: "teal" },
      })
        .jpeg()
        .toBuffer(),
    );
    session = { user: { id: OTHER } };
    assert.equal((await actions.finishSailPhoto(p.id)).ok, false);
    assert.equal(reads, 0);
    session = { user: { id: OWNER } };
    assert.equal((await actions.finishSailPhoto(p.id)).ok, true);
    assert.equal(files.has(raw.uploadKey), false);
    assert.equal(
      (await sharp(files.get(raw.storageKey)).metadata()).format,
      "webp",
    );
    assert.equal(await photos.published(p.id), null);
    assert.equal(
      (await actions.updateSailPhoto(p.id, details({ published: true }), 1)).ok,
      true,
    );
    const Route = await loadTypeScript(
      "src/app/sail/media/[photoId]/route.ts",
      {
        "@/data/sail-photos": { sailPhotos: () => photos },
        "@/data/document-storage": {
          readDocument: async (key) => files.get(key),
        },
      },
    );
    const response = await Route.GET(new Request("https://test.invalid"), {
      params: Promise.resolve({ photoId: p.id }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/webp");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    await actions.updateSailPhoto(p.id, details({ published: false }), 2);
    assert.equal(
      (
        await Route.GET(new Request("https://test.invalid"), {
          params: Promise.resolve({ photoId: p.id }),
        })
      ).status,
      404,
    );
    failSigning = true;
    const failed = await actions.startSailPhoto(
      "vessel",
      details(),
      "image/jpeg",
      100,
    );
    assert.equal(failed.ok, false);
    assert.equal(
      JSON.stringify(failed).includes("private provider detail"),
      false,
    );
  } finally {
    await db.close();
  }
});
test("028 rollout is additive and refuses replay and unrecognized databases", async () => {
  const { db } = await sailDatabase();
  try {
    const script = await readFile(
      "scripts/sail/photos-sql-editor/02-apply-028.sql",
      "utf8",
    );
    assert.equal(
      script
        .split("-- BEGIN UNCHANGED MIGRATION 028\n")[1]
        .split("-- END UNCHANGED MIGRATION 028")[0],
      await readFile("migrations/028_sail_photos.sql", "utf8"),
    );
    await assert.rejects(
      () => db.exec(script.replace("current_database()<>'neondb'", "true")),
      /Unexpected database/,
    );
    await db.exec("ROLLBACK");
    const tested = script.replace(
      "current_database()<>'neondb'",
      "current_database()<>current_database()",
    );
    await db.exec(tested);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM assets")).rows[0].n,
      2,
    );
    await db.exec(
      await readFile("scripts/sail/photos-sql-editor/03-verify.sql", "utf8"),
    );
    await assert.rejects(() => db.exec(tested), /already exists/);
    await db.exec("ROLLBACK");
  } finally {
    await db.close();
  }
});

test("failed image processing cannot mark an upload ready or expose a partial file", async () => {
  const { db, photos } = await fixture();
  try {
    const p = await photos.prepare(OWNER, "vessel", details());
    await assert.rejects(
      () =>
        photos.finalize(p.id, OWNER, async () => {
          throw Error("Synthetic decode failure");
        }),
      /decode/,
    );
    assert.equal((await photos.owned(p.id, OWNER)).ready, false);
    assert.equal(await photos.published(p.id), null);
    await assert.rejects(
      () =>
        photos.finalize(p.id, OTHER, async () => ({ width: 100, height: 100 })),
      /not found/,
    );
  } finally {
    await db.close();
  }
});
test("website upload reader enforces byte limits even without a trustworthy content length", async () => {
  const names = [
      "R2_ACCOUNT_ID",
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ],
    previous = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  let body,
    cancelled = 0;
  try {
    Object.assign(process.env, {
      R2_ENDPOINT: "https://synthetic.invalid",
      R2_ACCOUNT_ID: "synthetic",
      R2_ACCESS_KEY_ID: "synthetic",
      R2_SECRET_ACCESS_KEY: "synthetic",
      R2_BUCKET_NAME: "synthetic",
    });
    const Module = await loadTypeScript("src/data/document-storage.ts", {
      "@aws-sdk/client-s3": {
        S3Client: class {
          async send() {
            return { Body: { transformToWebStream: () => body } };
          }
        },
        GetObjectCommand: class {},
        DeleteObjectCommand: class {},
        HeadObjectCommand: class {},
        PutObjectCommand: class {},
      },
    });
    body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(4));
        c.enqueue(new Uint8Array(4));
        c.close();
      },
    });
    assert.equal((await Module.readStoredUpload("synthetic", 8)).length, 8);
    body = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(5));
      },
      cancel() {
        cancelled++;
      },
    });
    await assert.rejects(
      () => Module.readStoredUpload("synthetic", 8),
      /too large/,
    );
    assert.equal(cancelled, 1);
  } finally {
    for (const k of names) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
});
