import test from "node:test";
import assert from "node:assert/strict";
import {
  sailDatabase,
  OWNER,
  voyage,
  person,
} from "./helpers/sail-database.mjs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
test("Sail server actions derive owner from session, fail closed without sign-in and never return invitation tokens", async () => {
  const { db, store } = await sailDatabase();
  let session = null,
    mailCount = 0,
    failMail = false;
  const mail = {
    sailMailProblem: () => null,
    sendSailInvitation: async () => {
      mailCount++;
      if (failMail)
        throw Error("synthetic provider exception containing a private value");
    },
  };
  try {
    const actions = await loadTypeScript("src/app/sail/actions.ts", {
      "@/auth": { auth: async () => session },
      "@/data/sail": { sail: () => store },
      "@/data/sail-mail": mail,
      "next/cache": { revalidatePath() {} },
      "next/headers": {
        headers: async () => new Headers({ "x-forwarded-for": "192.0.2.1" }),
      },
    });
    assert.equal(
      (await actions.saveSailVoyage("vessel", null, voyage())).ok,
      false,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM sail_voyages")).rows[0].n,
      0,
    );
    assert.equal(mailCount, 0);
    session = { user: { id: OWNER } };
    const saved = await actions.saveSailVoyage("vessel", null, {
      ...voyage(),
      ownerId: "forged",
    });
    assert.equal(saved.ok, true);
    const id = saved.id;
    assert.equal((await store.ownerVoyage(id, OWNER)).ownerId, OWNER);
    const added = await actions.addSailPerson(id, person());
    assert.equal(added.ok, true);
    assert.equal(mailCount, 0);
    const sent = await actions.sendSailPerson(id, added.id);
    assert.equal(sent.ok, true);
    assert.equal(mailCount, 1);
    assert.equal(Object.hasOwn(sent, "token"), false);
    assert.equal(
      (await store.participants(id, OWNER))[0].deliveryStatus,
      "sent",
    );
    await db.query(
      "UPDATE sail_participants SET last_attempt_at=now()-interval '2 minutes' WHERE id=$1",
      [added.id],
    );
    failMail = true;
    const failed = await actions.sendSailPerson(id, added.id);
    assert.equal(failed.ok, false);
    assert.equal(JSON.stringify(failed).includes("private value"), false);
    assert.equal(
      (await store.participants(id, OWNER))[0].deliveryStatus,
      "failed",
    );
    session = null;
    assert.equal((await actions.sendSailPerson(id, added.id)).ok, false);
    assert.equal(mailCount, 2);
  } finally {
    await db.close();
  }
});
test("Sail email is disabled by default and Preview can send only to allowlisted test recipients", async () => {
  const keys = [
      "SAIL_EMAIL_ENABLED",
      "SAIL_TEST_RECIPIENTS",
      "SAIL_BASE_URL",
      "VERCEL_ENV",
      "EMAIL_FROM",
      "EMAIL_SERVER_USER",
      "EMAIL_SERVER_PASSWORD",
    ],
    previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    const { sailMailProblem } = await loadTypeScript("src/data/sail-mail.ts");
    delete process.env.SAIL_EMAIL_ENABLED;
    assert.match(sailMailProblem("test@example.invalid"), /not enabled/);
    Object.assign(process.env, {
      SAIL_EMAIL_ENABLED: "true",
      VERCEL_ENV: "preview",
      SAIL_TEST_RECIPIENTS: "test@example.invalid",
      SAIL_BASE_URL: "https://preview.example.invalid \n",
      EMAIL_FROM: "synthetic@example.invalid",
      EMAIL_SERVER_USER: "synthetic",
      EMAIL_SERVER_PASSWORD: "synthetic",
    });
    assert.equal(sailMailProblem("test@example.invalid"), null);
    process.env.SAIL_EMAIL_ENABLED = " true\n";
    assert.equal(sailMailProblem("test@example.invalid"), null);
    process.env.SAIL_EMAIL_ENABLED = "TRUE";
    assert.equal(sailMailProblem("test@example.invalid"), null);
    for (const flag of [
      "",
      "false",
      "yes",
      "1",
      '\"true\"',
      "do-not-echo-this-value",
    ]) {
      process.env.SAIL_EMAIL_ENABLED = flag;
      const problem = sailMailProblem("test@example.invalid");
      assert.match(problem, /not enabled/);
      assert.equal(problem.includes("do-not-echo-this-value"), false);
    }
    delete process.env.SAIL_EMAIL_ENABLED;
    assert.match(
      sailMailProblem("test@example.invalid"),
      /missing from this running deployment/,
    );
    process.env.SAIL_EMAIL_ENABLED = "true";
    assert.match(sailMailProblem("other@example.invalid"), /only/);
    process.env.SAIL_BASE_URL = "http://untrusted.invalid";
    assert.match(sailMailProblem("test@example.invalid"), /address/);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
test("Sail public page renders published data without owner guidance, private notes or invitee information", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(
      OWNER,
      "vessel",
      null,
      voyage({ published: true }),
    );
    await store.addPerson(id, OWNER, person());
    const Link = ({ href, children, ...props }) =>
      createElement("a", { href, ...props }, children);
    const Home = await loadTypeScript("src/app/sail/page.tsx", {
      "@/data/sail": { sail: () => store },
      "next/link": { default: Link },
    });
    const html = renderToStaticMarkup(await Home.default());
    assert.match(html, /Coastal passage/);
    assert.equal(html.includes(voyage().boardingNotes), false);
    assert.equal(html.includes(voyage().crewExpectations), false);
    assert.equal(html.includes(person().email), false);
    const Page = await loadTypeScript(
      "src/app/sail/voyages/[voyageId]/page.tsx",
      {
        "@/data/sail": { sail: () => store },
        "next/navigation": {
          notFound() {
            throw Error("Not found");
          },
        },
        "@/components/sail/interest-form": { SailInterestForm: () => null },
      },
    );
    const detail = renderToStaticMarkup(
      await Page.default({ params: Promise.resolve({ voyageId: id }) }),
    );
    assert.match(detail, /Port A/);
    assert.equal(detail.includes(voyage().boardingNotes), false);
  } finally {
    await db.close();
  }
});
test("Sail invitation HTML includes only the assigned guidance, is private to indexing/referrers, and GET makes no acceptance write", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage()),
      pid = await store.addPerson(id, OWNER, person({ role: "passenger" })),
      issued = await store.issue(id, OWNER, pid);
    const Page = await loadTypeScript(
      "src/app/sail/invitations/[token]/page.tsx",
      {
        "@/data/sail": { sail: () => store },
        "@/components/sail/guest-response": { SailGuestResponse: () => null },
      },
    );
    const html = renderToStaticMarkup(
      await Page.default({ params: Promise.resolve({ token: issued.token }) }),
    );
    assert.equal(html.includes(voyage().passengerExpectations), true);
    assert.equal(html.includes(voyage().crewExpectations), false);
    assert.equal(html.includes(person().email), false);
    assert.equal(Page.metadata.robots.index, false);
    assert.equal(Page.metadata.referrer, "no-referrer");
    assert.equal((await store.participants(id, OWNER))[0].status, "invited");
  } finally {
    await db.close();
  }
});
test("Sail schema rollout matches tested migration, preserves Ernest baseline and refuses replay or unknown database", async () => {
  const { db } = await sailDatabase();
  try {
    // Return only this synthetic database to a pre-027 state for the rollout test.
    await db.exec(
      "DROP TABLE sail_interest,sail_changes,sail_participants,sail_voyages; CREATE TABLE update_reviews(id uuid); CREATE TABLE maintenance_events(id uuid);",
    );
    const source = await readFile(
      "scripts/sail/sql-editor/02-apply-027.sql",
      "utf8",
    );
    assert.equal(
      source
        .split("-- BEGIN UNCHANGED MIGRATION 027\n")[1]
        .split("-- END UNCHANGED MIGRATION 027")[0],
      await readFile("migrations/027_sail_far_better.sql", "utf8"),
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
      await readFile("scripts/sail/sql-editor/03-verify.sql", "utf8"),
    );
    await assert.rejects(() => db.exec(script), /already exists/);
    await db.exec("ROLLBACK");
  } finally {
    await db.close();
  }
});

test("Sail management requires a signed-in vessel owner and sign-in returns only to the owner workspace", async () => {
  let session = null,
    assetReads = 0,
    assets = [];
  const signIns = [];
  const auth = {
    auth: async () => session,
    signIn: async (...args) => {
      signIns.push(args);
    },
  };
  const navigation = {
    redirect: (href) => {
      throw Error("redirect:" + href);
    },
    notFound: () => {
      throw Error("not-found");
    },
  };
  const Context = await loadTypeScript("src/app/sail/manage/context.ts", {
    "@/auth": auth,
    "@/data/assets": {
      getAssets: async () => {
        assetReads++;
        return assets;
      },
    },
    "@/data/sail": { sail: () => ({ available: async () => true }) },
    "next/navigation": navigation,
  });
  await assert.rejects(
    () => Context.sailOwnerContext(),
    /redirect:\/sail\/sign-in/,
  );
  assert.equal(assetReads, 0);
  session = { user: { id: OWNER } };
  await assert.rejects(() => Context.sailOwnerContext(), /not-found/);
  assets = [{ id: "vessel", name: "Test vessel" }];
  assert.equal((await Context.sailOwnerContext()).session.user.id, OWNER);
  session = null;
  const Page = await loadTypeScript("src/app/sail/sign-in/page.tsx", {
    "@/auth": auth,
    "next/navigation": navigation,
  });
  const tree = await Page.default(),
    form = tree.props.children.find((child) => child?.type === "form"),
    fd = new FormData();
  fd.set("email", "test@example.invalid");
  fd.set("redirectTo", "https://untrusted.invalid");
  await form.props.action(fd);
  assert.deepEqual(signIns, [
    [
      "nodemailer",
      { email: "test@example.invalid", redirectTo: "/sail/manage" },
    ],
  ]);
});

test("Sail invitation mail contains the actual plan and personal URL, with TLS and no remote content fetching", async () => {
  const keys = [
      "SAIL_EMAIL_ENABLED",
      "SAIL_TEST_RECIPIENTS",
      "SAIL_BASE_URL",
      "VERCEL_ENV",
      "EMAIL_FROM",
      "EMAIL_SERVER_USER",
      "EMAIL_SERVER_PASSWORD",
    ],
    previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  let options, message;
  try {
    Object.assign(process.env, {
      SAIL_EMAIL_ENABLED: "true",
      VERCEL_ENV: "preview",
      SAIL_TEST_RECIPIENTS: "test@example.invalid",
      SAIL_BASE_URL: "https://preview.example.invalid \n",
      EMAIL_FROM: "sender@example.invalid",
      EMAIL_SERVER_USER: "synthetic",
      EMAIL_SERVER_PASSWORD: "synthetic",
    });
    const Module = await loadTypeScript("src/data/sail-mail.ts", {
      nodemailer: {
        createTransport: (value) => {
          options = value;
          return {
            sendMail: async (value) => {
              message = value;
              return { accepted: ["test@example.invalid"], rejected: [] };
            },
          };
        },
      },
    });
    await Module.sendSailInvitation({
      token: "a".repeat(64),
      email: "test@example.invalid",
      fullName: "Test guest",
      role: "passenger",
      voyage: { ...voyage(), assetName: "Test vessel" },
    });
    assert.equal(options.requireTLS, true);
    assert.equal(message.to, "test@example.invalid");
    assert.match(message.subject, /Coastal passage/);
    assert.ok(message.text.includes(voyage().timingNote));
    assert.ok(
      message.text.includes(
        "https://preview.example.invalid/sail/invitations/" + "a".repeat(64),
      ),
    );
    assert.ok(message.text.includes("as a passenger"));
    assert.equal(message.disableFileAccess, true);
    assert.equal(message.disableUrlAccess, true);
    assert.equal(message.text.includes(voyage().boardingNotes), false);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
