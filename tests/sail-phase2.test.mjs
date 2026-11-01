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
  person,
} from "./helpers/sail-database.mjs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
async function fixture() {
  const f = await sailDatabase();
  for (const name of [
    "028_sail_photos.sql",
    "029_sail_position.sql",
    "030_sail_optional_email.sql",
    "031_sail_timeline_notifications.sql",
  ])
    await f.db.exec(await readFile("migrations/" + name, "utf8"));
  await f.db.exec("ALTER TABLE users ADD COLUMN email text");
  await f.db.query(
    "UPDATE users SET email=CASE WHEN id=$1 THEN $2 ELSE $3 END",
    [OWNER, "captain@example.invalid", "other@example.invalid"],
  );
  const { createSailTimelineStore } = await loadTypeScript(
      "src/data/sail-timeline-store.ts",
    ),
    { createSailNotificationStore } = await loadTypeScript(
      "src/data/sail-notification-store.ts",
    );
  return {
    ...f,
    timeline: createSailTimelineStore(f.sql),
    notifications: createSailNotificationStore(f.sql),
  };
}
test("availability is explicit, owner-scoped, stale-safe, public only on published trips and does not change an accepted plan", async () => {
  const f = await fixture();
  try {
    const id = await f.store.save(
        OWNER,
        "vessel",
        null,
        voyage({ published: true }),
      ),
      draft = await f.store.save(OWNER, "vessel", null, voyage()),
      pid = await f.store.addPerson(id, OWNER, person());
    const invite = await f.store.issue(id, OWNER, pid);
    await f.store.respond(invite.token, "accepted", 1, 2);
    assert.equal(
      await f.timeline.save(
        OWNER,
        id,
        { crewNeeded: 2, passengerPlaces: 0, note: "Crew wanted" },
        0,
      ),
      1,
    );
    await f.timeline.save(OWNER, draft, { crewNeeded: 4 }, 0);
    assert.equal((await f.timeline.publicAvailability()).length, 1);
    const g = await f.store.guest(invite.token);
    assert.equal(g.participant.acceptedRevision, g.voyage.revision);
    assert.equal(
      (await f.timeline.summary(OWNER)).find((v) => v.voyageId === id)
        .acceptedCrew,
      1,
    );
    await assert.rejects(
      () => f.timeline.save(OTHER, id, { crewNeeded: 3 }, 1),
      /not found/,
    );
    await assert.rejects(
      () => f.timeline.save(OWNER, id, { crewNeeded: 3 }, 0),
      /changed/,
    );
    await assert.rejects(
      () => f.timeline.save(OWNER, id, { crewNeeded: -1 }, 1),
      /whole number/,
    );
    assert.equal(
      await f.timeline.save(
        OWNER,
        id,
        { crewNeeded: 2, passengerPlaces: 0, note: "Crew wanted" },
        1,
      ),
      1,
    );
    const v = await f.store.ownerVoyage(id, OWNER);
    await f.store.save(
      OWNER,
      "vessel",
      id,
      { ...v, timingNote: "New dates" },
      1,
    );
    const summary = (await f.timeline.summary(OWNER)).find(
      (v) => v.voyageId === id,
    );
    assert.equal(summary.reconfirm, 1);
    assert.equal(summary.acceptedCrew, 0);
    assert.equal((await f.timeline.summary(OTHER)).length, 0);
  } finally {
    await f.db.close();
  }
});
test("notification intent is transactional, deduplicates revisions/no-op saves, contains no tokens, and claims only the matching owner", async () => {
  const f = await fixture();
  try {
    const id = await f.store.save(OWNER, "vessel", null, voyage()),
      v = await f.store.ownerVoyage(id, OWNER);
    await f.store.save(OWNER, "vessel", id, v, 1);
    assert.equal((await f.notifications.status(OWNER))[0].count, 1);
    const pid = await f.store.addPerson(id, OWNER, person()),
      invite = await f.store.issue(id, OWNER, pid);
    await f.store.recordDelivery(id, OWNER, pid, invite.hash, true);
    await f.store.save(OTHER, "other", null, voyage());
    const rows = (
      await f.db.query("SELECT * FROM sail_notifications WHERE owner_id=$1", [
        OWNER,
      ])
    ).rows;
    assert.equal(rows.length, 3);
    const encoded = JSON.stringify(rows);
    assert.equal(encoded.includes(invite.token), false);
    assert.equal(encoded.includes(invite.hash), false);
    assert.equal(encoded.includes("Crew-only"), false);
    assert.equal(
      (await f.notifications.claim("captain@example.invalid", OTHER)).length,
      0,
    );
    const claimed = await f.notifications.claim(
      "CAPTAIN@example.invalid",
      OWNER,
    );
    assert.equal(claimed.length, 3);
    assert.equal(
      (await f.notifications.claim("captain@example.invalid", OWNER)).length,
      0,
    );
    await f.notifications.complete(
      claimed.map((e) => e.id),
      true,
    );
    assert.equal(
      (await f.notifications.status(OWNER)).find((s) => s.state === "sent")
        .count,
      3,
    );
    const tx = f.db;
    await tx.exec("BEGIN");
    await tx.query(
      "UPDATE sail_voyages SET title='Rollback title',revision=2 WHERE id=$1",
      [id],
    );
    await tx.exec("ROLLBACK");
    assert.equal(
      (await f.notifications.status(OWNER)).reduce((n, r) => n + r.count, 0),
      3,
    );
  } finally {
    await f.db.close();
  }
});
test("enquiries, replies, photos, position and availability queue meaningful updates, while failed/sending deliveries require explicit review", async () => {
  const f = await fixture();
  try {
    const id = await f.store.save(
      OWNER,
      "vessel",
      null,
      voyage({ published: true }),
    );
    await f.store.interest(
      id,
      { ...person(), message: "Question" },
      "a".repeat(64),
    );
    await f.timeline.save(
      OWNER,
      id,
      { crewNeeded: 1, passengerPlaces: null },
      0,
    );
    const { createSailPhotoStore } = await loadTypeScript(
        "src/data/sail-photo-store.ts",
      ),
      photos = createSailPhotoStore(f.sql),
      photo = await photos.prepare(OWNER, "vessel", {
        category: "salon",
        caption: "Cabin",
      });
    let counts = (await f.notifications.status(OWNER)).reduce(
      (n, r) => n + r.count,
      0,
    );
    await photos.finalize(photo.id, OWNER, async () => ({
      width: 100,
      height: 100,
    }));
    assert.equal(
      (await f.notifications.status(OWNER)).reduce((n, r) => n + r.count, 0),
      counts + 1,
    );
    const { createSailPositionStore } = await loadTypeScript(
      "src/data/sail-position-store.ts",
    );
    await createSailPositionStore(f.sql).save(
      OWNER,
      "vessel",
      { placeLabel: "Harbour", reportedOn: "2026-10-30", published: true },
      0,
    );
    const claimed = await f.notifications.claim(
      "captain@example.invalid",
      OWNER,
    );
    assert.ok(claimed.some((e) => e.summary === "New trip enquiry"));
    assert.ok(claimed.some((e) => e.summary === "Position report saved"));
    await f.notifications.complete(
      claimed.map((e) => e.id),
      false,
    );
    await f.notifications.retryFailed(OTHER);
    assert.equal(
      (await f.notifications.claim("captain@example.invalid", OWNER)).length,
      0,
    );
    await f.notifications.retryFailed(OWNER);
    const retry = await f.notifications.claim("captain@example.invalid", OWNER);
    assert.equal(retry.length, claimed.length);
    assert.equal(
      (await f.notifications.claim("captain@example.invalid", OWNER)).length,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("timeline orders real windows, separates undated/closed plans, distinguishes zero from unknown and keeps owner counts out of public markup", async () => {
  const f = await fixture();
  try {
    const late = await f.store.save(
        OWNER,
        "vessel",
        null,
        voyage({
          title: "Later trip",
          published: true,
          departureFrom: "2026-12-01",
          departureTo: null,
          arrivalEstimate: null,
        }),
      ),
      early = await f.store.save(
        OWNER,
        "vessel",
        null,
        voyage({ title: "Earlier trip", published: true }),
      );
    await f.timeline.save(
      OWNER,
      early,
      { crewNeeded: 1, passengerPlaces: 0 },
      0,
    );
    await f.timeline.save(
      OWNER,
      late,
      { crewNeeded: null, passengerPlaces: 2 },
      0,
    );
    const { SailTripTimeline } = await loadTypeScript(
      "src/components/sail/trip-timeline.tsx",
      {
        "next/link": {
          default: ({ href, children, ...p }) =>
            createElement("a", { href, ...p }, children),
        },
      },
    );
    const props = {
      voyages: await f.store.publicList(),
      availability: await f.timeline.publicAvailability(),
    };
    const html = renderToStaticMarkup(createElement(SailTripTimeline, props));
    assert.ok(html.indexOf("Earlier trip") < html.indexOf("Later trip"));
    assert.ok(html.includes("No passenger places open"));
    assert.ok(html.includes("Ask me about crew"));
    assert.equal(html.includes("awaiting a reply"), false);
    const passengers = renderToStaticMarkup(
      createElement(SailTripTimeline, { ...props, role: "passenger" }),
    );
    assert.equal(passengers.includes("Earlier trip"), false);
    assert.ok(passengers.includes("?as=passenger#enquiry"));
  } finally {
    await f.db.close();
  }
});

test("notification dispatcher sends an owner-only digest through injected SMTP once, respects disabled delivery and retains failed work", async () => {
  const f = await fixture();
  const vars = [
    "DATABASE_URL",
    "SAIL_NOTIFICATIONS_ENABLED",
    "SAIL_NOTIFICATION_EMAIL",
    "SAIL_BASE_URL",
  ];
  const saved = Object.fromEntries(vars.map((v) => [v, process.env[v]]));
  try {
    process.env.DATABASE_URL = "synthetic";
    process.env.SAIL_NOTIFICATION_EMAIL = "captain@example.invalid";
    process.env.SAIL_BASE_URL = "https://sail.example.invalid";
    delete process.env.SAIL_NOTIFICATIONS_ENABLED;
    const sent = [];
    let fail = false;
    const mod = await loadTypeScript("src/data/sail-notifications.ts", {
      postgres: { default: () => f.sql },
      "./sail-notification-store": {
        createSailNotificationStore: () => f.notifications,
      },
      "next/server": { after() {} },
      nodemailer: {
        createTransport: () => ({
          sendMail: async (message) => {
            if (fail) throw Error("synthetic");
            sent.push(message);
            return { accepted: ["captain@example.invalid"], rejected: [] };
          },
        }),
      },
      "./sail-mail": { sailMailProblem: () => null },
    });
    const id = await f.store.save(OWNER, "vessel", null, voyage());
    await f.store.save(OTHER, "other", null, voyage());
    assert.equal((await mod.dispatchSailNotifications(OWNER)).ok, false);
    assert.equal(sent.length, 0);
    process.env.SAIL_NOTIFICATIONS_ENABLED = "true";
    assert.equal((await mod.dispatchSailNotifications(OWNER)).ok, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "captain@example.invalid");
    assert.equal(sent[0].text.includes("/invitations/"), false);
    assert.ok(sent[0].text.includes("/sail/manage/" + id));
    await mod.dispatchSailNotifications(OWNER);
    assert.equal(sent.length, 1);
    assert.equal((await f.notifications.status(OTHER))[0].state, "pending");
    const v = await f.store.ownerVoyage(id, OWNER);
    await f.store.save(
      OWNER,
      "vessel",
      id,
      { ...v, title: "New name" },
      v.revision,
    );
    fail = true;
    assert.equal((await mod.dispatchSailNotifications(OWNER)).ok, false);
    assert.ok(
      (await f.notifications.status(OWNER)).some((r) => r.state === "failed"),
    );
    fail = false;
    await mod.dispatchSailNotifications(OWNER);
    assert.equal(sent.length, 1);
  } finally {
    for (const v of vars) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
    await f.db.close();
  }
});

test("guarded phase2 rollout embeds unchanged SQL, preserves baseline content and rejects replay", async () => {
  const { db, store } = await sailDatabase();
  try {
    for (const f of [
      "028_sail_photos.sql",
      "029_sail_position.sql",
      "030_sail_optional_email.sql",
    ])
      await db.exec(await readFile("migrations/" + f, "utf8"));
    await db.exec(
      "CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());INSERT INTO schema_migrations(name) VALUES('030_sail_optional_email.sql')",
    );
    const id = await store.save(OWNER, "vessel", null, voyage());
    const source = await readFile(
      "scripts/sail/phase2-sql-editor/01-apply-031.sql",
      "utf8",
    );
    assert.equal(
      source
        .split("-- BEGIN UNCHANGED MIGRATION 031\n")[1]
        .split("-- END UNCHANGED MIGRATION 031")[0],
      await readFile("migrations/031_sail_timeline_notifications.sql", "utf8"),
    );
    const apply = source.replace(
      "current_database()<>'neondb'",
      "current_database()<>current_database()",
    );
    await db.exec(apply);
    assert.ok(await store.ownerVoyage(id, OWNER));
    await db.exec(
      await readFile("scripts/sail/phase2-sql-editor/02-verify.sql", "utf8"),
    );
    await assert.rejects(() => db.exec(apply), /exists or is partial/);
    await db.exec("ROLLBACK");
  } finally {
    await db.close();
  }
});
