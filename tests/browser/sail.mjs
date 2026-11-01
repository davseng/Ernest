// Synthetic loopback only. Real forms, server actions, authorization and SQL store.
// SMTP and Auth.js sessions are injected; no real email, credentials or production data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { sailDatabase, OWNER } from "../helpers/sail-database.mjs";
import { loadTypeScript } from "../helpers/load-typescript.mjs";
import { browserBundle } from "../helpers/browser-bundle.mjs";
const { db, store } = await sailDatabase();
let browser, server;
const mail = [];
try {
  await db.exec(
    await readFile("migrations/030_sail_optional_email.sql", "utf8"),
  );
  const actions = await loadTypeScript("src/app/sail/actions.ts", {
    "@/auth": { auth: async () => ({ user: { id: OWNER } }) },
    "@/data/sail": { sail: () => store },
    "@/data/sail-invitation-url": {
      sailInvitationOrigin: () => "https://sail.example.invalid",
    },
    "@/data/sail-mail": {
      sailMailProblem: () => null,
      sendSailInvitation: async (input) => {
        mail.push(input);
      },
    },
    "next/cache": { revalidatePath() {} },
    "next/headers": {
      headers: async () => new Headers({ "x-forwarded-for": "192.0.2.3" }),
    },
  });
  const actionNames = [
    "saveSailVoyage",
    "addSailPerson",
    "sendSailPerson",
    "createSailPersonLink",
    "updateSailPerson",
    "cancelSailPerson",
    "respondToSailInvitation",
    "submitSailInterest",
    "reviewSailEnquiry",
    "inviteSailEnquiry",
  ];
  const stubs = {
    "@/app/sail/timeline-actions": `exports.saveSailAvailability=async()=>({ok:false,error:"Not used by this suite"});`,
    "next/navigation": `exports.useRouter=()=>({push:href=>{history.pushState({},'',href);window.render();},refresh:()=>window.render()});`,
    "@/app/sail/actions": actionNames
      .map((name) => `exports.${name}=(...args)=>window.rpc('${name}',args);`)
      .join("\n"),
  };
  const entries = [
    "react",
    "react-dom/client",
    "@/components/sail/voyage-form",
    "@/components/sail/people",
    "@/components/sail/guest-response",
    "@/components/sail/invitation-content",
    "@/components/sail/interest-form",
    "@/components/sail/voyage-overview",
    "@/components/sail/workspace",
  ];
  const { ids, runtime } = await browserBundle(entries, stubs);
  const component = (path, name) =>
    `__require(${JSON.stringify(ids["@/components/sail/" + path])}).${name}`;
  const script =
    runtime +
    `
 window.rpc=async(action,args)=>{const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});if(!r.ok)throw Error('Synthetic boundary failure');return r.json();};
 const React=__require(${JSON.stringify(ids.react)}),h=React.createElement,root=__require(${JSON.stringify(ids["react-dom/client"])}).createRoot(document.getElementById('root'));
 window.render=async()=>{const state=await window.rpc('state',[location.pathname]);let content;
 if(state.guest){const g=state.guest;content=h(${component("invitation-content", "SailInvitationContent")},{guest:g,token:state.token,contactHref:'mailto:captain@example.invalid?subject=Trip'});}
 else if(state.publicVoyage){content=h(React.Fragment,null,h(${component("voyage-overview", "SailVoyageOverview")},{voyage:state.publicVoyage}),h(${component("interest-form", "SailInterestForm")},{voyageId:state.publicVoyage.id}));}
 else if(state.unavailable){content=h('h1',null,'Invitation unavailable');}
 else {content=state.voyage?h(${component("workspace", "SailWorkspace")},{voyage:state.voyage,assets:[{id:'vessel',name:'Test vessel'}],people:state.people,enquiries:state.enquiries}):h(${component("voyage-form", "SailVoyageForm")},{assets:[{id:'vessel',name:'Test vessel'}]});}
 root.render(h('div',{className:'sail-site'},h('main',{className:'sail-main sail-narrow'},content)));};window.render();`;
  const css =
    (await readFile("src/app/globals.css", "utf8")) +
    "\n" +
    (await readFile("src/app/sail/sail.css", "utf8"));
  server = createServer(async (req, res) => {
    try {
      if (req.url === "/bundle.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(script);
        return;
      }
      if (req.method === "GET") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
            css +
            '</style><div id="root"></div><script src="/bundle.js"></script>',
        );
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100000) throw Error("Too large");
      }
      const { action, args } = JSON.parse(body);
      let result;
      if (action === "state") {
        const path = args[0];
        if (path.includes("/invitations/")) {
          const token = path.split("/invitations/")[1],
            guest = await store.guest(token);
          result = { guest, token, unavailable: !guest };
        } else if (path.includes("/voyages/"))
          result = {
            publicVoyage: await store.publicVoyage(path.split("/voyages/")[1]),
          };
        else {
          const id = path.split("/manage/")[1],
            voyage =
              id && id !== "new" ? await store.ownerVoyage(id, OWNER) : null;
          result = {
            voyage,
            people: voyage ? await store.participants(id, OWNER) : [],
            enquiries: voyage ? await store.enquiries(id, OWNER) : [],
          };
        }
      } else if (actionNames.includes(action))
        result = await actions[action](...args);
      else throw Error("Unknown action");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 500;
      res.end("{}");
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
    viewport: { width: 1200, height: 950 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/sail/manage/new");
  await page.getByLabel("Voyage name", { exact: true }).fill("Browser passage");
  await page.getByLabel("From", { exact: true }).fill("Port A");
  await page.getByLabel("To", { exact: true }).fill("Port B");
  await page
    .getByLabel("About this voyage")
    .fill("Synthetic browser acceptance.");
  await page.getByLabel("Target departure", { exact: true }).fill("2026-11-10");
  await page.getByLabel("Use a departure window").check();
  await page.getByLabel("Latest departure").fill("2026-11-15");
  await page.getByLabel("Timing note").fill("Waiting for weather.");
  await page
    .getByText("What to expect · crew and passengers", { exact: true })
    .click();
  await page.getByLabel("Crew guidance").fill("Crew: discuss watchkeeping.");
  await page
    .getByLabel("Passenger guidance")
    .fill("Passenger: discuss life aboard.");
  await page.getByText("Private joining details", { exact: true }).click();
  await page
    .getByLabel("Joining details", { exact: true })
    .fill("Private boarding instructions.");
  await page.getByRole("button", { name: "Save voyage", exact: true }).click();
  await page.waitForURL("**/sail/manage/*");
  await page.getByRole("heading", { name: "People", exact: true }).waitFor();
  const id = page.url().split("/manage/")[1];
  assert.equal((await store.publicList()).length, 0);
  await page.getByLabel("Show this voyage on the public website").check();
  await page.getByRole("button", { name: "Save voyage", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Voyage saved" }).waitFor();
  assert.equal((await store.publicList()).length, 1);
  const add = page.getByRole("form", { name: "Add a person" });
  await add.getByLabel("Name", { exact: true }).fill("Browser crew");
  await add
    .getByLabel("Email (optional)", { exact: true })
    .fill("crew@example.invalid");
  await add.getByLabel("Joining as").selectOption("crew");
  await add.getByRole("button", { name: "Add person" }).click();
  await page.getByText("crew@example.invalid", { exact: true }).waitFor();
  assert.equal(mail.length, 0);
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "accepted for delivery" })
    .waitFor();
  assert.equal(mail.length, 1);
  const crewToken = mail[0].token;
  await page.goto(origin + "/sail/invitations/" + crewToken);
  await page
    .getByText("Crew: discuss watchkeeping.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText("Passenger: discuss life aboard.", { exact: true })
      .count(),
    0,
  );
  assert.equal((await store.guest(crewToken)).participant.status, "invited");
  await page.screenshot({
    path: "/tmp/sail-invitation-clarity.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Count me in" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "acceptance is saved" })
    .waitFor();
  assert.equal((await store.guest(crewToken)).participant.acceptedRevision, 2);
  await page.goto(origin + "/sail/manage/" + id);
  await page
    .getByLabel("Timing note")
    .fill("Repairs changed the weather window.");
  await page.getByRole("button", { name: "Save voyage", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Voyage saved" }).waitFor();
  await page.goto(origin + "/sail/invitations/" + crewToken);
  await page.getByText("What’s changed", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Yes, the updated plan works" })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "acceptance is saved" })
    .waitFor();
  assert.equal((await store.guest(crewToken)).participant.acceptedRevision, 3);
  await page.goto(origin + "/sail/manage/" + id);
  const addPassenger = page.getByRole("form", { name: "Add a person" });
  await addPassenger
    .getByLabel("Name", { exact: true })
    .fill("Browser passenger");
  await addPassenger
    .getByLabel("Email (optional)", { exact: true })
    .fill("passenger@example.invalid");
  await addPassenger.getByLabel("Joining as").selectOption("passenger");
  await addPassenger.getByRole("button", { name: "Add person" }).click();
  await page.getByText("passenger@example.invalid", { exact: true }).waitFor();
  const passengerRow = page
    .locator(".sail-people li")
    .filter({ hasText: "passenger@example.invalid" });
  await passengerRow
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "accepted for delivery" })
    .waitFor();
  assert.equal(mail.length, 2);
  const passengerToken = mail[1].token;
  await page.goto(origin + "/sail/invitations/" + passengerToken);
  await page
    .getByText("Passenger: discuss life aboard.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText("Crew: discuss watchkeeping.", { exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "I can’t make this one", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "can’t make this one" })
    .waitFor();
  await page.goto(origin + "/sail/manage/" + id);
  const cancel = page
    .locator(".sail-people li")
    .filter({ hasText: "passenger@example.invalid" });
  await cancel.getByText("Cancel invitation", { exact: true }).click();
  await cancel.getByRole("button", { name: "Confirm cancellation" }).click();
  await page.getByRole("status").filter({ hasText: "cancelled" }).waitFor();
  await page.goto(origin + "/sail/invitations/" + passengerToken);
  await page.getByRole("heading", { name: "Invitation unavailable" }).waitFor();
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "synthetic-browser-rate-key";
  try {
    await page.goto(origin + "/sail/voyages/" + id);
    assert.equal(
      await page
        .getByText("Private boarding instructions.", { exact: true })
        .count(),
      0,
    );
    const enquiry = page.getByRole("form", { name: "Voyage enquiry" });
    await enquiry.getByLabel("Your name").fill("Interested sailor");
    await enquiry
      .getByLabel("Email", { exact: true })
      .fill("interest@example.invalid");
    await enquiry
      .getByLabel("Anything you’d like to ask or tell me?")
      .fill("Synthetic enquiry.");
    await enquiry.getByRole("button", { name: "Send note" }).click();
    await page.getByRole("status").filter({ hasText: "received" }).waitFor();
    assert.equal((await store.enquiries(id, OWNER)).length, 1);
    await page
      .getByRole("heading", { name: "Your note is with me." })
      .waitFor();
    await page.getByText("Synthetic enquiry.", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("heading", { name: "Your note is with me." })
        .evaluate((el) => document.activeElement === el),
      true,
    );
    await page.screenshot({
      path: "/tmp/sail-enquiry-receipt.png",
      fullPage: true,
    });
    const mailBeforeEnquiry = mail.length;
    await page.goto(origin + "/sail/manage/" + id);
    await page.getByText(/Enquiries \(/).click();
    await page
      .getByRole("button", { name: "Invite this person", exact: true })
      .click();
    await page
      .locator(".sail-people li")
      .filter({ hasText: "Interested sailor" })
      .waitFor();
    await page
      .getByRole("button", { name: "Invite this person", exact: true })
      .click();
    assert.equal(
      (await store.participants(id, OWNER)).filter(
        (p) => p.email === "interest@example.invalid",
      ).length,
      1,
    );
    assert.equal(mail.length, mailBeforeEnquiry);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
  await page.goto(origin + "/sail/manage/" + id);
  const noEmailForm = page.getByRole("form", { name: "Add a person" });
  await noEmailForm
    .getByLabel("Name", { exact: true })
    .fill("Friend without email");
  await noEmailForm
    .getByRole("button", { name: "Add person", exact: true })
    .click();
  const friend = page
    .locator(".sail-people li")
    .filter({ hasText: "Friend without email" });
  await friend
    .getByRole("button", { name: "Send invitation", exact: true })
    .waitFor();
  assert.equal(
    await friend
      .getByRole("button", { name: "Send invitation", exact: true })
      .isDisabled(),
    true,
  );
  const beforeLinkMail = mail.length;
  await friend
    .getByRole("button", { name: "Create invitation link", exact: true })
    .click();
  const field = friend.getByLabel("Personal invitation link", { exact: true });
  await field.waitFor();
  await page.setViewportSize({ width: 375, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const personalLink = await field.inputValue();
  assert.match(
    personalLink,
    /^https:\/\/sail\.example\.invalid\/sail\/invitations\/[a-f0-9]{64}$/,
  );
  assert.equal(mail.length, beforeLinkMail);
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await friend.getByRole("button", { name: "Copy link", exact: true }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    personalLink,
  );
  await page.goto(origin + new URL(personalLink).pathname);
  await page.getByRole("button", { name: "Count me in", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "acceptance is saved" })
    .first()
    .waitFor();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(origin + "/sail/manage/" + id);
  await page.getByRole("form", { name: "Voyage editor" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/sail-voyage-editor.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual Sail forms/actions/store create a private voyage, publish safely, add crew/passengers without sending automatically, deliver synthetic invitations, accept/reconfirm a changed plan, show role-specific guidance, decline/cancel access, submit a private enquiry, create/copy an email-free personal link and accept it, and fit a mobile viewport. No live SMTP or Auth.js/Vercel/Neon acceptance.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  await db.close();
}
