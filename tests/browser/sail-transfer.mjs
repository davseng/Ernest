// Actual transfer component/actions/stores, two isolated synthetic databases and storage maps.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { chromium } from "playwright";
import { sailDatabase, OWNER, voyage } from "../helpers/sail-database.mjs";
import { loadTypeScript } from "../helpers/load-typescript.mjs";
import { browserBundle } from "../helpers/browser-bundle.mjs";
const environments = {};
let browser,
  server,
  mode = "preview",
  origin;
try {
  for (const name of ["preview", "production"]) {
    const f = await sailDatabase();
    await f.db.exec(await readFile("migrations/028_sail_photos.sql", "utf8"));
    await f.db.exec(await readFile("migrations/029_sail_position.sql", "utf8"));
    const { createSailPhotoStore } = await loadTypeScript(
        "src/data/sail-photo-store.ts",
      ),
      { createSailPositionStore } = await loadTypeScript(
        "src/data/sail-position-store.ts",
      ),
      { createSailTransferStore } = await loadTypeScript(
        "src/data/sail-transfer-store.ts",
      );
    environments[name] = {
      ...f,
      photos: createSailPhotoStore(f.sql),
      positions: createSailPositionStore(f.sql),
      transfer: createSailTransferStore(f.sql),
      objects: new Map(),
    };
  }
  const source = environments.preview;
  const trip = await source.store.save(
    OWNER,
    "vessel",
    null,
    voyage({ published: true }),
  );
  const photo = await source.photos.prepare(OWNER, "vessel", {
    category: "cockpit",
    caption: "Friends aboard",
    altText: "Synthetic cockpit",
    voyageId: trip,
  });
  source.objects.set(
    photo.storageKey,
    await sharp({
      create: { width: 200, height: 120, channels: 3, background: "#237c78" },
    })
      .webp()
      .toBuffer(),
  );
  await source.photos.finalize(photo.id, OWNER, async () => ({
    width: 200,
    height: 120,
  }));
  await source.photos.update(
    photo.id,
    OWNER,
    {
      category: "cockpit",
      caption: "Friends aboard",
      altText: "Synthetic cockpit",
      voyageId: trip,
      published: true,
      voyageCover: true,
    },
    1,
  );
  await source.positions.save(
    OWNER,
    "vessel",
    {
      placeLabel: "Test harbour",
      reportedOn: "2026-10-30",
      note: "Waiting for friends.",
      latitude: 12,
      longitude: -45,
      photoId: photo.id,
      published: true,
    },
    0,
  );
  const f = () => environments[mode];
  const stubs = {
    "@/auth": { auth: async () => ({ user: { id: OWNER } }) },
    "@/data/assets": {
      getAssets: async () => [{ id: "vessel", name: "Test vessel" }],
    },
    "@/data/sail": { sail: () => f().store },
    "@/data/sail-photos": { sailPhotos: () => f().photos },
    "@/data/sail-position": { sailPosition: () => f().positions },
    "@/data/sail-transfer": { sailTransfer: () => f().transfer },
    "next/cache": { revalidatePath() {} },
    "@/data/document-storage": {
      createDocumentUploadUrl: async (key) =>
        origin + "/upload/" + mode + "/" + encodeURIComponent(key),
      inspectDocument: async (key) => ({
        sizeBytes: f().objects.get(key)?.length ?? 0,
      }),
      readStoredUpload: async (key) => f().objects.get(key),
      storeDocumentBytes: async (key, bytes) => {
        f().objects.set(key, bytes);
      },
      deleteStoredDocument: async (key) => {
        f().objects.delete(key);
      },
    },
  };
  const actions = await loadTypeScript(
      "src/app/sail/transfer-actions.ts",
      stubs,
    ),
    photoActions = await loadTypeScript("src/app/sail/photo-actions.ts", stubs);
  const actionNames = [
      "exportSailContent",
      "checkSailImportTarget",
      "importSailContent",
    ],
    photoNames = ["startSailPhoto", "finishSailPhoto", "removeSailPhoto"];
  const { ids, runtime } = await browserBundle(
    ["react", "react-dom/client", "@/components/sail/content-transfer"],
    {
      "@/app/sail/transfer-actions": actionNames
        .map(
          (n) =>
            `exports.${n}=(...args)=>window.rpc(${JSON.stringify(n)},args);`,
        )
        .join("\n"),
      "@/app/sail/photo-actions": photoNames
        .map(
          (n) =>
            `exports.${n}=(...args)=>window.rpc(${JSON.stringify(n)},args);`,
        )
        .join("\n"),
    },
  );
  const script =
    runtime +
    `window.rpc=async(action,args)=>{const r=await fetch('/rpc/'+location.pathname.slice(1),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});if(!r.ok)throw Error('Synthetic RPC error');return r.json();};const React=__require(${JSON.stringify(ids.react)});__require(${JSON.stringify(ids["react-dom/client"])}).createRoot(document.getElementById('root')).render(React.createElement(__require(${JSON.stringify(ids["@/components/sail/content-transfer"])}).SailContentTransfer,{assets:[{id:'vessel',name:'Test vessel'}]}));`;
  const css = await readFile("src/app/sail/sail.css", "utf8");
  server = createServer(async (req, res) => {
    try {
      if (req.url === "/bundle.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(script);
        return;
      }
      if (req.url.startsWith("/upload/")) {
        const parts = req.url.split("/"),
          env = environments[parts[2]],
          key = decodeURIComponent(parts.slice(3).join("/"));
        const chunks = [];
        for await (const c of req) chunks.push(c);
        env.objects.set(key, Buffer.concat(chunks));
        res.end("ok");
        return;
      }
      if (req.url.startsWith("/rpc/")) {
        mode = req.url.split("/")[2];
        let body = "";
        for await (const c of req) body += c;
        const { action, args } = JSON.parse(body);
        const fn = actions[action] ?? photoActions[action];
        const result = await fn(...args);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
        return;
      }
      if (req.url.startsWith("/sail/manage/photos/")) {
        const id = req.url.split("/")[4],
          p = await source.photos.owned(id, OWNER);
        res.setHeader("Content-Type", "image/webp");
        res.end(source.objects.get(p.storageKey));
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
          css +
          '</style><main class="sail-site sail-main"><div id="root"></div></main><script src="/bundle.js"></script>',
      );
    } catch (e) {
      console.log("Synthetic transfer error:", e.message);
      res.statusCode = 500;
      res.end("Error");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath:
      process.env.ERNEST_CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
  });
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/preview");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Sail content", exact: true })
    .click();
  const download = await downloadPromise;
  const filename = "/tmp/sail-synthetic-content.json";
  await download.saveAs(filename);
  const file = JSON.parse(await readFile(filename, "utf8"));
  assert.equal(file.content.photos.length, 1);
  assert.equal(file.images.length, 1);
  assert.equal(JSON.stringify(file).includes("storageKey"), false);
  await page.goto(origin + "/production");
  await page.getByLabel("Sail content file").setInputFiles(filename);
  try { await page.getByLabel(/Copy into Test vessel/).check(); } catch(e) { console.log("Synthetic UI:",await page.locator("body").innerText()); throw e; }
  await page
    .getByRole("button", { name: "Copy Sail content", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Copied 1 voyages, 1 photos and the position report." })
    .waitFor();
  const dest = environments.production;
  assert.equal((await dest.store.ownerList(OWNER)).length, 1);
  const copied = (await dest.photos.list(OWNER))[0];
  assert.equal(copied.published, true);
  assert.equal(copied.voyageCover, true);
  assert.notEqual(copied.id, photo.id);
  assert.equal((await dest.positions.publicLatest()).photoId, copied.id);
  const stored = await dest.photos.owned(copied.id, OWNER);
  assert.ok(dest.objects.get(stored.storageKey).length > 0);
  assert.equal((await source.photos.list(OWNER)).length, 1);
  assert.equal((await source.store.ownerList(OWNER)).length, 1);
  await page.getByLabel("Sail content file").setInputFiles(filename);
  try { await page.getByLabel(/Copy into Test vessel/).check(); } catch(e) { console.log("Synthetic UI:",await page.locator("body").innerText()); throw e; }
  await page
    .getByRole("button", { name: "Copy Sail content", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "already has Sail content" })
    .waitFor();
  assert.equal((await dest.photos.list(OWNER)).length, 1);
  assert.equal((await dest.store.ownerList(OWNER)).length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual transfer UI downloads owner content and photo bytes from synthetic Preview, uploads to separate synthetic Production storage, commits remapped plans/photos/position with publication preserved, leaves source intact and refuses repeat import. No live credentials, storage, mail or databases.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  for (const e of Object.values(environments)) await e.db.close();
}
