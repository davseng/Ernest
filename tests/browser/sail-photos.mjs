// Actual website-photo form/actions/SQL and image processing, synthetic loopback R2/session.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { chromium } from "playwright";
import { sailDatabase, OWNER } from "../helpers/sail-database.mjs";
import { loadTypeScript } from "../helpers/load-typescript.mjs";
import { browserBundle } from "../helpers/browser-bundle.mjs";
const { db, sql } = await sailDatabase();
let server, browser;
const files = new Map();
try {
  await db.exec(await readFile("migrations/028_sail_photos.sql", "utf8"));
  const { createSailPhotoStore } = await loadTypeScript(
      "src/data/sail-photo-store.ts",
    ),
    photos = createSailPhotoStore(sql);
  let origin;
  const storage = {
    createDocumentUploadUrl: async (key) =>
      origin + "/upload/" + encodeURIComponent(key),
    inspectDocument: async (key) => ({
      sizeBytes: files.get(key)?.length ?? 0,
    }),
    readStoredUpload: async (key) => files.get(key),
    storeDocumentBytes: async (key, bytes) => files.set(key, bytes),
    deleteStoredDocument: async (key) => files.delete(key),
    readDocument: async (key) => files.get(key),
  };
  const auth = { "@/auth": { auth: async () => ({ user: { id: OWNER } }) } },
    facade = {
      "@/data/sail-photos": { sailPhotos: () => photos },
      "@/data/document-storage": storage,
    };
  const actions = await loadTypeScript("src/app/sail/photo-actions.ts", {
    ...auth,
    ...facade,
    "next/cache": { revalidatePath() {} },
  });
  const imageRoute = await loadTypeScript(
    "src/app/sail/manage/photos/[photoId]/image/route.ts",
    { ...auth, ...facade },
  );
  const publicRoute = await loadTypeScript(
    "src/app/sail/media/[photoId]/route.ts",
    facade,
  );
  const names = [
    "startSailPhoto",
    "finishSailPhoto",
    "updateSailPhoto",
    "removeSailPhoto",
  ];
  const { ids, runtime } = await browserBundle(
    ["react", "react-dom/client", "@/components/sail/photo-manager"],
    {
      "@/app/sail/photo-actions": names
        .map((n) => `exports.${n}=(...args)=>window.rpc('${n}',args);`)
        .join("\n"),
      "next/navigation": `exports.useRouter=()=>({refresh:()=>window.render()});`,
      "next/image": `exports.__esModule=true;exports.default=function Image({unoptimized,priority,...props}){return require('react').createElement('img',props);};`,
    },
  );
  const script =
    runtime +
    `window.rpc=async(action,args)=>{const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});if(!r.ok)throw Error('Synthetic boundary failure');return r.json();};const React=__require(${JSON.stringify(ids.react)}),root=__require(${JSON.stringify(ids["react-dom/client"])}).createRoot(document.getElementById('root'));window.render=async()=>{const photos=await window.rpc('list',[]);root.render(React.createElement('div',{className:'sail-site'},React.createElement('main',{className:'sail-main'},React.createElement(__require(${JSON.stringify(ids["@/components/sail/photo-manager"])}).SailPhotoManager,{assets:[{id:'vessel',name:'Test vessel'}],voyages:[],photos}))));};window.render();`;
  const css = await readFile("src/app/sail/sail.css", "utf8");
  server = createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/upload/") && req.method === "PUT") {
        const parts = [];
        for await (const c of req) parts.push(c);
        files.set(
          decodeURIComponent(req.url.slice("/upload/".length)),
          Buffer.concat(parts),
        );
        res.end();
        return;
      }
      if (
        req.url.startsWith("/sail/manage/photos/") ||
        req.url.startsWith("/sail/media/")
      ) {
        const privateImage = req.url.startsWith("/sail/manage/photos/"),
          id = privateImage ? req.url.split("/")[4] : req.url.split("/")[3],
          r = await (privateImage ? imageRoute : publicRoute).GET(
            new Request(origin + req.url),
            { params: Promise.resolve({ photoId: id }) },
          );
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      if (req.url === "/bundle.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(script);
        return;
      }
      if (req.method === "GET") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
            css +
            '</style><div id="root"></div><script src="/bundle.js"></script>',
        );
        return;
      }
      let body = "";
      for await (const c of req) body += c;
      const { action, args } = JSON.parse(body);
      const result =
        action === "list"
          ? await photos.list(OWNER)
          : await actions[action](...args);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch (e) {
      console.log("Synthetic photo RPC error:", e.message);
      res.statusCode = 500;
      res.end("{}");
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
  const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("Synthetic photo browser error:", e.message);
  });
  page.setDefaultTimeout(10000);
  await page.goto(origin);
  const form = page.getByRole("form", { name: "Upload website photo" });
  await form.getByLabel("Section", { exact: true }).selectOption("galley");
  await form.getByLabel("Caption", { exact: true }).fill("Test galley");
  await form.getByLabel("Photo file").setInputFiles({
    name: "galley.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp({
      create: { width: 200, height: 150, channels: 3, background: "#bb9966" },
    })
      .jpeg()
      .toBuffer(),
  });
  await form.getByRole("button", { name: "Upload private photo" }).click();
  await page.getByRole("status").filter({ hasText: "private until" }).waitFor();
  const edit = page.getByRole("form", { name: "Edit photo: Test galley" });
  await edit.waitFor();
  const [photo] = await photos.list(OWNER);
  assert.equal((await photos.publicPhotos()).length, 0);
  assert.equal(
    (
      await publicRoute.GET(new Request(origin), {
        params: Promise.resolve({ photoId: photo.id }),
      })
    ).status,
    404,
  );
  await edit.getByLabel("Publish this photo").check();
  await edit.getByLabel("Use as homepage cover").check();
  await edit.getByRole("button", { name: "Save photo" }).click();
  await page.getByRole("status").filter({ hasText: "Photo saved" }).waitFor();
  await page.waitForFunction(async () => {
    const r = await window.rpc("list", []);
    return r[0]?.published === true;
  });
  assert.equal((await photos.publicPhotos())[0].homeCover, true);
  const r = await publicRoute.GET(new Request(origin), {
    params: Promise.resolve({ photoId: photo.id }),
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await sharp(Buffer.from(await r.arrayBuffer())).metadata()).format,
    "webp",
  );
  await page
    .getByRole("form", { name: "Edit photo: Test galley" })
    .getByLabel("Publish this photo")
    .uncheck();
  await page
    .getByRole("form", { name: "Edit photo: Test galley" })
    .getByRole("button", { name: "Save photo" })
    .click();
  await page.waitForFunction(
    async () => !(await window.rpc("list", []))[0]?.published,
  );
  assert.equal(await photos.published(photo.id), null);
  await page.setViewportSize({ width: 375, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByText("Remove photo", { exact: true }).click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await page
    .getByText("No website photos uploaded yet.", { exact: true })
    .waitFor();
  assert.equal((await photos.list(OWNER)).length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real website-photo form/actions/store and image processing upload privately, publish an explicit cover, serve a normalised image, unpublish immediately, fit mobile and remove safely. Synthetic R2 and owner session only.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  await db.close();
}
