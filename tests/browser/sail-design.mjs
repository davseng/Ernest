// Real public page composition, gallery dialog, Leaflet, position form/actions/store.
// Local synthetic images/session/database; OSM tile requests are fulfilled locally.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { chromium } from "playwright";
import { sailDatabase, OWNER, voyage } from "../helpers/sail-database.mjs";
import { loadTypeScript } from "../helpers/load-typescript.mjs";
import { browserBundle } from "../helpers/browser-bundle.mjs";
const { db, sql, store } = await sailDatabase();
let server, browser;
try {
  await db.exec(await readFile("migrations/028_sail_photos.sql", "utf8"));
  await db.exec(await readFile("migrations/029_sail_position.sql", "utf8"));
  const { createSailPhotoStore } = await loadTypeScript(
      "src/data/sail-photo-store.ts",
    ),
    photos = createSailPhotoStore(sql),
    { createSailPositionStore } = await loadTypeScript(
      "src/data/sail-position-store.ts",
    ),
    position = createSailPositionStore(sql);
  await store.save(OWNER, "vessel", null, voyage({ published: true }));
  const files = new Map();
  let index = 0;
  for (const category of [
    "exterior",
    "cockpit",
    "sailing",
    "salon",
    "galley",
    "forward_berth",
    "aft_berth",
    "forward_lav",
  ]) {
    const p = await photos.prepare(OWNER, "vessel", {
      category,
      caption: category + " photo",
      altText: category + " aboard",
      position: index++,
    });
    const portrait = category === "exterior" || category === "forward_lav",
      width = portrait ? 350 : 900,
      height = portrait ? 650 : 550;
    files.set(
      p.id,
      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: ["#527c86", "#b7a181", "#d6a48b"][index % 3],
        },
      })
        .webp()
        .toBuffer(),
    );
    await photos.finalize(p.id, OWNER, async () => ({ width, height }));
    await photos.update(
      p.id,
      OWNER,
      {
        category,
        caption: category + " photo",
        altText: category + " aboard",
        published: true,
      },
      1,
    );
  }
  const galleryProps = (props) =>
      createElement("div", { "data-gallery": JSON.stringify(props) }),
    mapProps = (props) =>
      createElement("div", { "data-map": JSON.stringify(props) }),
    formProps = (props) =>
      createElement("div", { "data-position-form": JSON.stringify(props) });
  const Image = (input) => {
      const props = { ...input };
      delete props.unoptimized;
      delete props.priority;
      return createElement("img", props);
    },
    Link = ({ href, children, ...props }) =>
      createElement("a", { href, ...props }, children);
  const stubs = {
    "@/data/sail": { sail: () => store },
    "@/data/sail-photos": { sailPhotos: () => photos },
    "@/data/sail-position": { sailPosition: () => position },
    "next/image": { default: Image },
    "next/link": { default: Link },
    "@/components/sail/photo-gallery": { SailPhotoGallery: galleryProps },
    "@/components/sail/position-map": { SailPositionMap: mapProps },
    "@/components/sail/position-form": { SailPositionForm: formProps },
    "../context": {
      sailOwnerContext: async () => ({
        session: { user: { id: OWNER } },
        assets: [{ id: "vessel", name: "Test vessel" }],
        ready: true,
      }),
    },
  };
  const Boat = await loadTypeScript("src/app/sail/boat/page.tsx", stubs),
    Join = await loadTypeScript("src/app/sail/join/page.tsx", stubs),
    Home = await loadTypeScript("src/app/sail/page.tsx", stubs),
    OwnerPage = await loadTypeScript(
      "src/app/sail/manage/position/page.tsx",
      stubs,
    );
  const actions = await loadTypeScript("src/app/sail/position-actions.ts", {
    "@/auth": { auth: async () => ({ user: { id: OWNER } }) },
    "@/data/sail-position": { sailPosition: () => position },
    "next/cache": { revalidatePath() {} },
  });
  const { ids, runtime } = await browserBundle(
    [
      "react",
      "react-dom/client",
      "@/components/sail/photo-gallery",
      "@/components/sail/position-form",
      "@/components/sail/position-map",
    ],
    {
      "next/image": `exports.__esModule=true;exports.default=({unoptimized,priority,...props})=>require('react').createElement('img',props);`,
      "next/navigation": `exports.useRouter=()=>({refresh:()=>window.refreshPosition()});`,
      "@/app/sail/position-actions": `exports.saveSailPosition=(...args)=>window.rpc('save',args);`,
      "leaflet/dist/leaflet.css": "",
    },
  );
  const script =
    runtime +
    `const React=__require(${JSON.stringify(ids.react)}),h=React.createElement,createRoot=__require(${JSON.stringify(ids["react-dom/client"])}).createRoot;window.rpc=async(action,args)=>{const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});if(!r.ok)throw Error('Synthetic RPC failed');return r.json();};for(const el of document.querySelectorAll('[data-gallery]'))createRoot(el).render(h(__require(${JSON.stringify(ids["@/components/sail/photo-gallery"])}).SailPhotoGallery,JSON.parse(el.dataset.gallery)));for(const el of document.querySelectorAll('[data-map]'))createRoot(el).render(h(__require(${JSON.stringify(ids["@/components/sail/position-map"])}).SailPositionMap,JSON.parse(el.dataset.map)));const form=document.querySelector('[data-position-form]');if(form){const root=createRoot(form),props=JSON.parse(form.dataset.positionForm);const render=()=>root.render(h(__require(${JSON.stringify(ids["@/components/sail/position-form"])}).SailPositionForm,props));window.refreshPosition=async()=>{props.initial=(await window.rpc('position',[]))[0]??null;render();};render();}`;
  const css =
    (await readFile("src/app/globals.css", "utf8")) +
    (await readFile("node_modules/leaflet/dist/leaflet.css", "utf8")) +
    (await readFile("src/app/sail/sail.css", "utf8"));
  server = createServer(async (req, res) => {
    try {
      if (req.url === "/bundle.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(script);
        return;
      }
      if (req.method === "POST") {
        let body = "";
        for await (const c of req) body += c;
        const { action, args } = JSON.parse(body);
        const result =
          action === "save"
            ? await actions.saveSailPosition(...args)
            : await position.ownerList(OWNER);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
        return;
      }
      if (req.url.startsWith("/sail/media/")) {
        const id = req.url.split("/")[3];
        if (!(await photos.published(id))) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "image/webp");
        res.end(files.get(id));
        return;
      }
      const url = new URL(req.url, "http://synthetic.invalid");
      let tree;
      if (url.pathname === "/sail/boat") tree = await Boat.default();
      else if (url.pathname === "/sail/join")
        tree = await Join.default({
          searchParams: Promise.resolve({ as: url.searchParams.get("as") }),
        });
      else if (url.pathname === "/sail/manage/position")
        tree = await OwnerPage.default({ searchParams: Promise.resolve({}) });
      else tree = await Home.default();
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
          css +
          '</style><div class="sail-site">' +
          renderToStaticMarkup(tree) +
          '</div><script src="/bundle.js"></script>',
      );
    } catch (e) {
      console.log("Synthetic design error:", e.message);
      res.statusCode = 500;
      res.end("Synthetic error");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath:
      process.env.ERNEST_CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
  });
  const page = await browser.newPage({
      viewport: { width: 1250, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("Synthetic design browser error:", e.message);
  });
  page.setDefaultTimeout(10000);
  let tileRequests = 0;
  const tile = await sharp({
    create: { width: 256, height: 256, channels: 3, background: "#d8e1d5" },
  })
    .png()
    .toBuffer();
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    tileRequests++;
    await route.fulfill({ status: 200, contentType: "image/png", body: tile });
  });
  await page.goto(origin + "/sail/boat");
  await page.getByRole("heading", { name: /Welcome aboard/ }).waitFor();
  assert.equal(
    await page.locator("html").evaluate((el) => el.scrollWidth <= innerWidth),
    true,
  );
  await page.screenshot({
    path: "/tmp/sail-boat-redesign-desktop.png",
    fullPage: true,
  });
  const opener = page.getByRole("button", {
    name: "View photo: exterior photo",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Boat photographs" });
  await dialog.waitFor();
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  await dialog.getByRole("button", { name: "Next →", exact: true }).click();
  await dialog
    .getByRole("img", { name: "cockpit aboard", exact: true })
    .waitFor();
  await page.keyboard.press("ArrowLeft");
  await dialog
    .getByRole("img", { name: "exterior aboard", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await opener.evaluate((el) => document.activeElement === el),
    true,
  );
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await page.goto(origin + "/sail/join?as=passenger");
  await page
    .getByRole("heading", { name: "Come along.", exact: true })
    .waitFor();
  assert.ok(
    (await page.locator('a[href*="#enquiry"]').getAttribute("href")).includes(
      `?as=passenger#enquiry`,
    ),
  );
  await page.screenshot({
    path: "/tmp/sail-joining-redesign-desktop.png",
    fullPage: true,
  });
  await page.goto(origin + "/sail/manage/position");
  await page.getByLabel("Place", { exact: true }).fill("Test harbour");
  await page.getByLabel("Reported on", { exact: true }).fill("2026-10-30");
  await page
    .getByLabel("My update", { exact: true })
    .fill("Getting ready for friends to come aboard.");
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Position report saved" })
    .waitFor();
  assert.equal(await position.publicLatest(), null);
  await page.getByLabel("Show this report on the public website").check();
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await page.waitForFunction(
    async () => (await window.rpc("position", []))[0].published === true,
  );
  assert.equal((await position.publicLatest()).latitude, null);
  await page.getByLabel("Include a map pin").check();
  await page.getByRole("button", { name: /Open map to place/ }).click();
  await page.locator(".leaflet-control-zoom-in").waitFor();
  await page.locator(".sail-map").click({ position: { x: 180, y: 140 } });
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Latitude"]').value !== "",
  );
  assert.equal(await page.locator(".leaflet-marker-icon").count(), 1);
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await page.waitForFunction(
    async () => (await window.rpc("position", []))[0].latitude !== null,
  );
  assert.ok(Number.isFinite((await position.publicLatest()).latitude));
  const before = tileRequests;
  await page.goto(origin + "/sail");
  await page
    .getByRole("heading", { name: "Where’s Test vessel?", exact: true })
    .waitFor();
  assert.equal(tileRequests, before);
  await page.getByRole("button", { name: /Show map/ }).click();
  await page.locator(".leaflet-control-zoom-in").waitFor();
  await page.getByText("Reported October 30, 2026", { exact: true }).waitFor();
  await page.goto(origin + "/sail/manage/position");
  await page.getByLabel("Show this report on the public website").uncheck();
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await page.waitForFunction(
    async () => (await window.rpc("position", []))[0].published === false,
  );
  assert.equal(await position.publicLatest(), null);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(origin + "/sail/boat");
  await page
    .getByRole("button", { name: "View photo: exterior photo", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/sail-boat-redesign-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View photo: exterior photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await page.goto(origin + "/sail/join");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/sail-joining-redesign-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual Boat/Joining page composition, public role links, lightbox next/previous/Escape/focus/scroll restoration, owner report save/publish and click-to-pin Leaflet map, dated public report, unpublish and mobile layout. Synthetic data/images/session; OSM requests intercepted, no live tiles or locations.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  await db.close();
}
