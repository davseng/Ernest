import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { sailDatabase, OWNER, voyage } from "../helpers/sail-database.mjs";
import { loadTypeScript } from "../helpers/load-typescript.mjs";
import { browserBundle } from "../helpers/browser-bundle.mjs";
const { db, sql, store } = await sailDatabase();
let server, browser;
try {
  for (const name of [
    "028_sail_photos.sql",
    "029_sail_position.sql",
    "030_sail_optional_email.sql",
    "031_sail_timeline_notifications.sql",
  ])
    await db.exec(await readFile("migrations/" + name, "utf8"));
  await db.exec("ALTER TABLE users ADD COLUMN email text");
  await db.query("UPDATE users SET email=$1 WHERE id=$2", [
    "captain@example.invalid",
    OWNER,
  ]);
  const { createSailTimelineStore } = await loadTypeScript(
      "src/data/sail-timeline-store.ts",
    ),
    timeline = createSailTimelineStore(sql),
    { createSailNotificationStore } = await loadTypeScript(
      "src/data/sail-notification-store.ts",
    ),
    notifications = createSailNotificationStore(sql);
  const early = await store.save(
    OWNER,
    "vessel",
    null,
    voyage({ published: true, title: "November sail" }),
  );
  await timeline.save(
    OWNER,
    early,
    { crewNeeded: 1, passengerPlaces: 0, note: "Crew wanted" },
    0,
  );
  const later = await store.save(
    OWNER,
    "vessel",
    null,
    voyage({
      published: true,
      title: "December sail",
      departureFrom: "2026-12-10",
      departureTo: null,
      arrivalEstimate: null,
    }),
  );
  await timeline.save(
    OWNER,
    later,
    { crewNeeded: null, passengerPlaces: 2 },
    0,
  );
  await store.save(OWNER, "vessel", null, voyage({ title: "Private draft" }));
  await store.save(
    OWNER,
    "vessel",
    null,
    voyage({
      title: "Old completed trip",
      status: "completed",
      published: true,
    }),
  );
  const pid = await store.addPerson(early, OWNER, {
    fullName: "Alex Crew",
    email: "alex@example.invalid",
    role: "crew",
  });
  const invite = await store.issue(early, OWNER, pid);
  await store.respond(invite.token, "accepted", 1, 2);
  await store.addPerson(early, OWNER, {
    fullName: "Sam Passenger",
    email: "sam@example.invalid",
    role: "passenger",
  });
  const stubs = {
    "@/data/sail": { sail: () => store },
    "@/data/sail-timeline": { sailTimeline: () => timeline },
    "@/data/sail-photos": {
      sailPhotos: () => ({ available: async () => false }),
    },
    "./context": {
      sailOwnerContext: async () => ({
        session: { user: { id: OWNER } },
        assets: [{ id: "vessel", name: "Test vessel" }],
        ready: true,
      }),
    },
    "next/link": {
      default: ({ href, children, ...props }) =>
        createElement("a", { href, ...props }, children),
    },
  };
  stubs["../context"] = stubs["./context"];
  const CrewPage = await loadTypeScript(
    "src/app/sail/manage/crew/page.tsx",
    stubs,
  );
  const voyageActions = await loadTypeScript("src/app/sail/actions.ts", {
    "@/auth": { auth: async () => ({ user: { id: OWNER } }) },
    "@/data/sail": { sail: () => store },
    "@/data/sail-notifications": { scheduleSailNotifications() {} },
    "next/cache": { revalidatePath() {} },
  });
  const Public = await loadTypeScript("src/app/sail/trips/page.tsx", stubs),
    OwnerPage = await loadTypeScript("src/app/sail/manage/page.tsx", stubs);
  const actions = await loadTypeScript("src/app/sail/timeline-actions.ts", {
    "@/auth": { auth: async () => ({ user: { id: OWNER } }) },
    "@/data/sail-timeline": { sailTimeline: () => timeline },
    "next/cache": { revalidatePath() {} },
    "@/data/sail-notifications": { scheduleSailNotifications() {} },
  });
  const { ids, runtime } = await browserBundle(
    [
      "react",
      "react-dom/client",
      "@/components/sail/availability-form",
      "@/components/sail/voyage-form",
    ],
    {
      "next/navigation": `exports.useRouter=()=>({refresh(){},push(){location.href='/owner';}});`,
      "@/app/sail/actions": `exports.saveSailVoyage=(...args)=>window.rpc('saveSailVoyage',args);`,
      "@/app/sail/timeline-actions": `exports.saveSailAvailability=(...args)=>window.rpc('saveSailAvailability',args);`,
    },
  );
  const script =
    runtime +
    `window.rpc=async(action,args)=>{const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});return r.json();};const React=__require(${JSON.stringify(ids.react)}),root=__require(${JSON.stringify(ids["react-dom/client"])});const el=document.getElementById('editor');if(el)root.createRoot(el).render(React.createElement(__require(${JSON.stringify(ids["@/components/sail/availability-form"])}).SailAvailabilityForm,JSON.parse(el.dataset.props)));const n=document.getElementById('new-trip');if(n)root.createRoot(n).render(React.createElement(__require(${JSON.stringify(ids["@/components/sail/voyage-form"])}).SailVoyageForm,{assets:[{id:'vessel',name:'Test vessel'}]}));`;
  const css = await readFile("src/app/sail/sail.css", "utf8");
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
        const result = await (actions[action] ?? voyageActions[action])(
          ...args,
        );
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
        return;
      }
      const url = new URL(req.url, "http://synthetic.invalid");
      let content;
      if (url.pathname === "/owner/edit") {
        const initial = (await timeline.ownerAvailability(OWNER)).find(
          (a) => a.voyageId === early,
        );
        content = renderToStaticMarkup(
          createElement("div", {
            id: "editor",
            "data-props": JSON.stringify({ voyageId: early, initial }),
          }),
        );
      } else if (url.pathname === "/owner/new")
        content = '<div id="new-trip"></div>';
      else if (url.pathname === "/owner/crew")
        content = renderToStaticMarkup(await CrewPage.default());
      else
        content = renderToStaticMarkup(
          url.pathname === "/owner"
            ? await OwnerPage.default()
            : await Public.default({
                searchParams: Promise.resolve({
                  as: url.searchParams.get("as"),
                }),
              }),
        );
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
          css +
          '</style><div class="sail-site">' +
          content +
          '</div><script src="/bundle.js"></script>',
      );
    } catch (e) {
      console.log("Synthetic phase2 error:", e.message);
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
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/public");
  await page.getByRole("heading", { name: "Trips ahead." }).waitFor();
  assert.equal(
    await page.getByText("Private draft", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText("Old completed trip", { exact: true }).count(),
    0,
  );
  await page
    .getByText("Looking for 1 more crew member", { exact: true })
    .waitFor();
  assert.equal(await page.getByText(/awaiting a reply/).count(), 0);
  await page.screenshot({
    path: "/tmp/sail-timeline-public.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Come as a passenger", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("link", { name: "November sail", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("link", { name: "December sail", exact: true })
    .waitFor();
  await page.goto(origin + "/owner");
  await page
    .getByRole("link", { name: "Private draft", exact: true })
    .waitFor();
  await page.getByText("Completed and canceled trips", { exact: true }).click();
  await page
    .getByRole("link", { name: "Old completed trip", exact: true })
    .waitFor();
  await page.screenshot({
    path: "/tmp/sail-timeline-owner.png",
    fullPage: true,
  });
  await page.goto(origin + "/owner/edit");
  await page.getByLabel("More crew needed").fill("2");
  await page.getByLabel("Passenger places open").fill("");
  await page
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Availability saved" })
    .waitFor();
  assert.equal((await store.ownerVoyage(early, OWNER)).revision, 1);
  assert.equal(
    (await timeline.ownerAvailability(OWNER)).find((a) => a.voyageId === early)
      .passengerPlaces,
    null,
  );
  assert.ok(
    (await notifications.status(OWNER)).some((r) => r.state === "pending"),
  );
  await page.goto(origin + "/owner/new");
  await page
    .getByLabel("Voyage name", { exact: true })
    .fill("Created with spaces");
  await page.getByLabel("More crew needed").fill("2");
  await page.getByLabel("Passenger places open").fill("3");
  await page.getByLabel("A note about space").fill("Come along");
  await page.getByRole("button", { name: "Save voyage", exact: true }).click();
  await page.waitForURL("**/owner");
  const created = (await store.ownerList(OWNER)).find(
    (v) => v.title === "Created with spaces",
  );
  assert.ok(created);
  const initialSpaces = (await timeline.ownerAvailability(OWNER)).find(
    (a) => a.voyageId === created.id,
  );
  assert.equal(initialSpaces.crewNeeded, 2);
  assert.equal(initialSpaces.passengerPlaces, 3);
  await page.goto(origin + "/owner/crew");
  await page
    .getByRole("heading", { name: "Crew & spaces", exact: true })
    .waitFor();
  await page.getByText("Alex Crew · crew", { exact: true }).waitFor();
  await page.getByText("Sam Passenger · passenger", { exact: true }).waitFor();
  await page.getByText("Need an invitation", { exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/sail-crew-table.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(origin + "/owner/crew");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/sail-timeline-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual public/owner timeline pages, role filters, unknown/zero availability, draft and closed-trip privacy, owner availability form/actions with unchanged guest plan, new-trip initial spaces, crew/passenger roster table and mobile layout. Synthetic PostgreSQL/session/mail only.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  await db.close();
}
