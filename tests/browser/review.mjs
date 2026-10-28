// Actual React review/chat + actual actions/store/PostgreSQL. Synthetic loopback
// authentication/provider only; no live DB, email, R2, private data or screenshots.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import {
  reviewDatabase,
  OWNER,
  ITEM,
  SURVEY,
  WORK,
  maintenance,
  draft,
  adapt,
} from "../helpers/review-database.mjs";
import { loadTypeScript } from "../helpers/load-typescript.mjs";
import { browserBundle } from "../helpers/browser-bundle.mjs";
const { db } = await reviewDatabase();
const assetId = "vessel";
let server,
  browser,
  failAudit = false;
const previousUrl = process.env.DATABASE_URL,
  previousKey = process.env.OPENAI_API_KEY;
process.env.DATABASE_URL = "postgres://synthetic-browser-only";
process.env.OPENAI_API_KEY = "synthetic-provider-only";
try {
  const faulty = (conn) => {
    const sql = async (strings, ...values) => {
      if (failAudit && strings.join("").includes("INSERT INTO update_audit")) {
        failAudit = false;
        throw Object.assign(Error("Synthetic rollback"), { code: "XX000" });
      }
      return adapt(conn)(strings, ...values);
    };
    sql.begin = (fn) => conn.transaction((tx) => fn(faulty(tx)));
    sql.json = (x) => JSON.stringify(x);
    sql.unsafe = async (query, values = []) =>
      (await conn.query(query, values)).rows;
    return sql;
  };
  const sql = faulty(db);
  const { createReviewStore } = await loadTypeScript(
    "src/data/review-store.ts",
  );
  const store = createReviewStore(sql);
  const reviewContextModule = await loadTypeScript(
    "src/data/review-context.ts",
    {
      postgres: { default: () => sql },
      "@/data/reviews": { reviews: () => store },
      "./reviews": { reviews: () => store },
    },
  );
  class AI {
    responses = {
      create: async () => ({
        output: [
          {
            type: "function_call",
            call_id: "prepare",
            name: "prepare_update",
            arguments: JSON.stringify(
              draft([maintenance()], { title: "Review impeller replacement" }),
            ),
          },
        ],
        output_text: "",
      }),
    };
  }
  const planner = await loadTypeScript("src/data/review-planner.ts", {
    openai: { default: AI },
  });
  const auth = { auth: async () => ({ user: { id: OWNER } }) };
  const { askErnest } = await loadTypeScript(
    "src/app/assets/[id]/ask-actions.ts",
    {
      "@/auth": auth,
      "@/data/reviews": { reviews: () => store },
      "@/data/review-context": reviewContextModule,
      "@/data/review-planner": planner,
    },
  );
  const actions = await loadTypeScript(
    "src/app/assets/[id]/review-actions.ts",
    {
      "@/auth": auth,
      "next/cache": { revalidatePath() {} },
      "next/navigation": {
        redirect: (href) => {
          throw { redirect: href };
        },
      },
      "@/data/reviews": { reviews: () => store },
    },
  );
  const messages = [];
  const stubs = {
    "@/app/assets/[id]/ask-actions": `exports.askErnest=(id,previous,fd)=>window.rpc('ask',{id,form:Object.fromEntries(fd)});`,
    "@/app/assets/[id]/review-actions": `exports.saveReview=(id,reviewId,draft,coverage)=>window.rpc('save',{id,reviewId,draft,coverage});exports.cancelReview=(id,reviewId)=>window.rpc('cancel',{id,reviewId});`,
    "@/app/assets/[id]/conversation-actions": `exports.startConversation=()=>window.rpc('start',{});exports.saveConversationMessage=(id,cid,message)=>window.rpc('message',{message});exports.saveConversationMessageState=()=>{};`,
  };
  const { ids, runtime } = await browserBundle(
    [
      "react",
      "react-dom/client",
      "@/components/ernest-chat",
      "@/components/review-form",
      "@/components/review-history",
    ],
    stubs,
  );
  const script =
    runtime +
    `window.rpc=async(action,args)=>{const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});if(!r.ok)throw Error('Synthetic boundary failure');return r.json();};(async()=>{const state=await window.rpc('state',{path:location.pathname});const React=__require(${JSON.stringify(ids.react)}),root=__require(${JSON.stringify(ids["react-dom/client"])}).createRoot(document.getElementById('root'));if(state.review){root.render(React.createElement(React.Fragment,null,React.createElement(__require(${JSON.stringify(ids["@/components/review-form"])}).ReviewForm,{assetId:'vessel',reviewId:state.review.id,initial:state.review.draft,status:state.review.status,savedReceipt:state.review.receipt,choices:state.choices}),state.audit?React.createElement(__require(${JSON.stringify(ids["@/components/review-history"])}).ReviewHistory,{changes:state.audit.changes}):null));}else root.render(React.createElement(__require(${JSON.stringify(ids["@/components/ernest-chat"])}).ErnestChat,{assetId:'vessel',assetName:'Synthetic',initialConversationId:'chat',initialMessages:state.messages,recentConversations:[]}));})();`;
  server = createServer(async (req, res) => {
    try {
      if (req.url === "/bundle.js") {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.end(script);
        return;
      }
      if (req.method === "GET") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>',
        );
        return;
      }
      let body = "";
      for await (const c of req) {
        body += c;
        if (body.length > 200000) throw Error("Too large");
      }
      const { action, args } = JSON.parse(body);
      let result;
      if (action === "state") {
        const context = await reviewContextModule.reviewContext(assetId, OWNER);
        const id = args.path?.split("/reviews/")[1];
        const review = id ? await store.get(assetId, OWNER, id) : null;
        result = {
          messages,
          review,
          choices: {
            inventory: context.inventory,
            equipment: context.asset.systems.flatMap((s) => s.components),
            documents: context.documents,
          },
          events: await store.events(assetId, OWNER),
          quantity: context.inventory.find((i) => i.id === ITEM).quantity,
          audit: id
            ? (await store.audit(assetId, OWNER)).find(
                (a) => a.review_id === id,
              )
            : null,
        };
      } else if (action === "ask") {
        const fd = new FormData();
        for (const [k, v] of Object.entries(args.form)) fd.set(k, v);
        result = await askErnest(args.id, {}, fd);
      } else if (action === "save")
        result = await actions.saveReview(
          args.id,
          args.reviewId,
          args.draft,
          args.coverage,
        );
      else if (action === "cancel")
        result = await actions.cancelReview(args.id, args.reviewId);
      else if (action === "message") {
        const id = randomUUID();
        messages.push({ ...args.message, id });
        result = { ok: true, messageId: id };
      } else if (action === "start")
        result = { ok: true, conversation: { id: "chat", title: "Test" } };
      else if (action === "correct") {
        try {
          await actions.prepareMaintenanceCorrection(assetId, args.eventId);
        } catch (e) {
          if (e.redirect) result = { href: e.redirect };
          else throw e;
        }
      } else if (action === "blank") {
        const fd = new FormData();
        fd.set("kind", "maintenance");
        try {
          await actions.startBlankReview(assetId, fd);
        } catch (e) {
          if (e.redirect) result = { href: e.redirect };
          else throw e;
        }
      } else if (action === "surveyDraft") {
        const rows = ["A1", "A2"].map((identifier) => ({
          id: identifier,
          kind: "survey",
          include: true,
          evidence: [
            { documentId: WORK, pageNumber: 1, quote: "Work order evidence" },
          ],
          reason: "Owner reviews repair scope",
          documentId: SURVEY,
          identifier,
          priority: "A",
          wording:
            identifier === "A1" ? "Deck core at mast" : "Deck core at windlass",
          pageNumber: 1,
          status: "needs_review",
          notes: "Scope needs review.",
        }));
        result = {
          id: await store.create(
            assetId,
            OWNER,
            "Reconcile survey repairs",
            draft(rows, {
              coverage:
                "Partial extracted-page coverage; completeness must be checked by the owner.",
            }),
          ),
        };
      } else if (action === "failNext") {
        failAudit = true;
        result = { ok: true };
      } else throw Error("Unknown synthetic action");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch (error) {
      console.log(
        "Synthetic RPC error:",
        error.code ?? "",
        error.message ?? "Unknown",
      );
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
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("Synthetic browser error:", e.message);
  });
  await page.goto(origin);
  await page
    .getByPlaceholder("Ask or tell Ernest anything…")
    .fill(
      "I replaced the impeller on October 22, 2026 with an impeller from current spares. Please update our records.",
    );
  await page.getByRole("button", { name: "↑", exact: true }).click();
  await page.getByRole("link", { name: "Open editable update form" }).click();
  await page.getByRole("form", { name: "Editable update review" }).waitFor();
  assert.equal(
    await page.getByLabel("event: Work date", { exact: true }).inputValue(),
    "2026-10-22",
  );
  assert.equal(
    await page.getByLabel("event: Engine hours", { exact: true }).inputValue(),
    "",
  );
  let state = await page.evaluate(() =>
    window.rpc("state", { path: location.pathname }),
  );
  assert.equal(state.events.length, 0);
  assert.equal(state.quantity, "3");
  await page.getByRole("button", { name: "Save selected changes" }).click();
  await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
  state = await page.evaluate(() =>
    window.rpc("state", { path: location.pathname }),
  );
  assert.equal(state.events[0].occurred_on, "2026-10-22");
  assert.equal(state.quantity, "2");
  assert.equal(state.events.length, 1);
  const correction = await page.evaluate(
    (eventId) => window.rpc("correct", { eventId }),
    state.events[0].id,
  );
  await page.goto(origin + correction.href);
  await page
    .getByLabel("correction: Work date", { exact: true })
    .fill("2026-10-23");
  await page.getByRole("button", { name: "Save selected changes" }).click();
  await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
  state = await page.evaluate(() =>
    window.rpc("state", { path: location.pathname }),
  );
  assert.equal(state.events[0].occurred_on, "2026-10-23");
  assert.equal(state.events[0].revision, 2);
  assert.equal(state.quantity, "2");
  await page.reload();
  await page
    .getByText("Previous and approved versions", { exact: true })
    .click();
  assert.match(await page.locator("body").innerText(), /2026-10-22/);
  assert.match(await page.locator("body").innerText(), /2026-10-23/);
  const blank = await page.evaluate(() => window.rpc("blank", {}));
  await page.goto(origin + blank.href);
  await page
    .getByLabel("manual: Title (required)", { exact: true })
    .fill("Owner-entered work");
  await page
    .getByLabel("manual: Work performed (required)", { exact: true })
    .fill("Work recorded without an exact work date.");
  await page.evaluate(() => window.rpc("failNext", {}));
  await page.getByRole("button", { name: "Save selected changes" }).click();
  await page.getByRole("alert").filter({ hasText: "rolled back" }).waitFor();
  state = await page.evaluate(() =>
    window.rpc("state", { path: location.pathname }),
  );
  assert.equal(state.events.length, 1);
  assert.equal(state.review.status, "pending");
  await page.getByRole("button", { name: "Save selected changes" }).click();
  await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
  state = await page.evaluate(() =>
    window.rpc("state", { path: location.pathname }),
  );
  assert.equal(state.events.length, 2);
  assert.equal(
    state.events.find((e) => e.title === "Owner-entered work").occurred_on,
    null,
  );
  const survey = await page.evaluate(() => window.rpc("surveyDraft", {}));
  await page.goto(origin + "/assets/vessel/reviews/" + survey.id);
  await page
    .getByLabel("A1: Original identifier (required)", { exact: true })
    .waitFor();
  await page
    .getByLabel("A1: Proposed status", { exact: true })
    .selectOption("partially_addressed");
  await page
    .locator("fieldset")
    .nth(1)
    .getByRole("checkbox", { name: "Include this change", exact: true })
    .uncheck();
  await page.getByRole("checkbox", { name: /I checked this list/ }).check();
  await page.getByRole("button", { name: "Save selected changes" }).click();
  await page.getByRole("alert").filter({ hasText: "excluded" }).waitFor();
  assert.equal((await store.survey(assetId, OWNER)).length, 0);
  await page.getByRole("checkbox", { name: /I checked this list/ }).uncheck();
  await page.getByRole("button", { name: "Save selected changes" }).click();
  await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
  const report = await store.survey(assetId, OWNER);
  assert.equal(report.length, 1);
  assert.equal(report[0].wording, "Deck core at mast");
  assert.equal(report[0].status, "partially_addressed");
  assert.equal(
    (await store.get(assetId, OWNER, survey.id)).receipt.coverage.confirmed,
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual chat investigates and creates a pending review; editable form preserves explicit date/unknown hours; no pre-approval writes; atomic spare consumption; receipt after refresh; date correction retains before/after and does not reconsume; blank manual form works without the model; failed transaction rolls back and can be retried exactly once; editable survey statuses, excluded items and honest coverage confirmation. Synthetic loopback PostgreSQL/provider/session only.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
}
