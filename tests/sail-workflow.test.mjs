import test from "node:test";
import assert from "node:assert/strict";
import {
  sailDatabase,
  OWNER,
  OTHER,
  voyage,
  person,
} from "./helpers/sail-database.mjs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const { parseVoyage, parsePerson, departureLabel } =
  await loadTypeScript("src/domain/sail.ts");
test("Sail timing supports open dates, target dates and simple windows without inventing dates", () => {
  assert.equal(
    parseVoyage(
      voyage({ departureFrom: null, departureTo: null, arrivalEstimate: null }),
    ).departureFrom,
    null,
  );
  assert.equal(
    parseVoyage(voyage({ departureTo: null })).departureFrom,
    "2026-11-10",
  );
  assert.match(
    departureLabel("2026-11-10", "2026-11-15"),
    /Nov 10, 2026.*Nov 15, 2026/,
  );
  for (const values of [
    { departureFrom: "2026-02-30" },
    { departureFrom: null, departureTo: "2026-11-01" },
    { departureTo: "2026-11-01" },
    { arrivalEstimate: "2026-11-01" },
    { published: true, summary: "" },
  ])
    assert.throws(() => parseVoyage(voyage(values)));
  assert.throws(() =>
    parsePerson(person({ email: "bad\r\n@example.invalid" })),
  );
  assert.throws(() => parsePerson(person({ role: "admin" })));
  assert.equal(
    parsePerson(person({ email: " GUEST@example.invalid " })).email,
    "guest@example.invalid",
  );
});
test("Sail owners control their vessels; public projections omit private fields and unpublished voyages", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage());
    assert.equal((await store.publicList()).length, 0);
    assert.equal(await store.publicVoyage(id), null);
    assert.equal(await store.ownerVoyage(id, OTHER), null);
    assert.deepEqual(await store.ownerList(OTHER), []);
    await assert.rejects(
      () => store.save(OTHER, "vessel", null, voyage()),
      /not found/,
    );
    await assert.rejects(
      () => store.save(OTHER, "other", id, voyage(), 1),
      /not found/,
    );
    await assert.rejects(
      () => store.addPerson(id, OTHER, person()),
      /not found/,
    );
    await assert.rejects(() => store.participants(id, OTHER), /not found/);
    await assert.rejects(() => store.enquiries(id, OTHER), /not found/);
    await store.save(OWNER, "vessel", id, voyage({ published: true }), 1);
    const pub = await store.publicVoyage(id);
    assert.equal(pub.title, "Coastal passage");
    for (const field of [
      "ownerId",
      "assetId",
      "email",
      "boardingNotes",
      "crewExpectations",
      "passengerExpectations",
      "published",
    ])
      assert.equal(Object.hasOwn(pub, field), false);
    assert.equal(await store.publicVoyage("' OR true--"), null);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM sail_changes")).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});
test("Sail plan changes reject stale saves; unchanged saves do not request another participant confirmation", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage());
    await store.save(OWNER, "vessel", id, voyage(), 1);
    assert.equal((await store.ownerVoyage(id, OWNER)).revision, 1);
    await store.save(
      OWNER,
      "vessel",
      id,
      voyage({
        departureFrom: "2026-11-12",
        timingNote: "Mechanical work changed the plan.",
      }),
      1,
    );
    await assert.rejects(
      () => store.save(OWNER, "vessel", id, voyage(), 1),
      /changed/,
    );
    const rows = (
      await db.query(
        "SELECT before_record,after_record FROM sail_changes WHERE revision=2",
      )
    ).rows;
    assert.equal(rows[0].before_record.departureFrom, "2026-11-10");
    assert.equal(rows[0].after_record.departureFrom, "2026-11-12");
  } finally {
    await db.close();
  }
});
test("Sail invitations isolate roles, store only hashed secrets, and require POST-style explicit responses", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage());
    const crew = await store.addPerson(id, OWNER, person()),
      passenger = await store.addPerson(
        id,
        OWNER,
        person({ email: "passenger@example.invalid", role: "passenger" }),
      );
    await assert.rejects(() => store.addPerson(id, OWNER, person()), /already/);
    await assert.rejects(() => store.issue(id, OTHER, crew), /not found/);
    const c = await store.issue(id, OWNER, crew),
      p = await store.issue(id, OWNER, passenger);
    const raw = (
      await db.query(
        "SELECT token_hash,status FROM sail_participants WHERE id=$1",
        [crew],
      )
    ).rows[0];
    assert.notEqual(raw.token_hash, c.token);
    assert.equal(raw.token_hash, c.hash);
    assert.equal(raw.status, "invited");
    const cg = await store.guest(c.token),
      pg = await store.guest(p.token);
    assert.equal(cg.expectations, voyage().crewExpectations);
    assert.equal(pg.expectations, voyage().passengerExpectations);
    assert.equal(cg.boardingNotes, voyage().boardingNotes);
    assert.equal(Object.hasOwn(cg.participant, "email"), false);
    assert.equal(Object.hasOwn(cg.voyage, "ownerId"), false);
    assert.equal(
      JSON.stringify(cg).includes(voyage().passengerExpectations),
      false,
    );
    assert.equal(
      (await store.participants(id, OWNER)).find((x) => x.id === crew).status,
      "invited",
    );
    assert.equal(await store.guest("not-a-token"), null);
    await store.respond(c.token, "accepted", 1, cg.participant.revision);
    await store.respond(c.token, "accepted", 1, cg.participant.revision);
    assert.equal((await store.guest(c.token)).participant.status, "accepted");
    const latest = await store.guest(c.token);
    await store.save(
      OWNER,
      "vessel",
      id,
      voyage({ timingNote: "Waiting for repairs." }),
      1,
    );
    await assert.rejects(
      () => store.respond(c.token, "accepted", 1, latest.participant.revision),
      /plan changed/,
    );
    const changed = await store.guest(c.token);
    assert.equal(changed.participant.acceptedRevision, 1);
    assert.equal(changed.voyage.revision, 2);
    await store.respond(c.token, "accepted", 2, changed.participant.revision);
    assert.equal((await store.guest(c.token)).participant.acceptedRevision, 2);
  } finally {
    await db.close();
  }
});
test("Sail cancellation, expiry, resending and changing an invitee revoke old access; delivery is recorded honestly", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage()),
      pid = await store.addPerson(id, OWNER, person());
    const first = await store.issue(id, OWNER, pid);
    await store.recordDelivery(id, OWNER, pid, "wrong", true);
    assert.equal(
      (await store.participants(id, OWNER))[0].deliveryStatus,
      "pending",
    );
    await store.recordDelivery(id, OWNER, pid, first.hash, false);
    assert.equal(
      (await store.participants(id, OWNER))[0].deliveryStatus,
      "failed",
    );
    await assert.rejects(() => store.issue(id, OWNER, pid), /Wait a minute/);
    await db.query(
      "UPDATE sail_participants SET last_attempt_at=now()-interval '2 minutes' WHERE id=$1",
      [pid],
    );
    const second = await store.issue(id, OWNER, pid);
    assert.equal(await store.guest(first.token), null);
    assert.ok(await store.guest(second.token));
    const p = (await store.participants(id, OWNER))[0];
    await assert.rejects(
      () =>
        store.updatePerson(
          id,
          OTHER,
          pid,
          person({ role: "passenger" }),
          p.revision,
        ),
      /not found/,
    );
    await store.updatePerson(
      id,
      OWNER,
      pid,
      person({ role: "passenger" }),
      p.revision,
    );
    assert.equal(await store.guest(second.token), null);
    assert.equal((await store.participants(id, OWNER))[0].role, "passenger");
    await db.query(
      "UPDATE sail_participants SET last_attempt_at=now()-interval '2 minutes' WHERE id=$1",
      [pid],
    );
    const third = await store.issue(id, OWNER, pid);
    await db.query(
      "UPDATE sail_participants SET token_expires_at=now()-interval '1 second' WHERE id=$1",
      [pid],
    );
    assert.equal(await store.guest(third.token), null);
    await db.query(
      "UPDATE sail_participants SET last_attempt_at=now()-interval '2 minutes' WHERE id=$1",
      [pid],
    );
    const fourth = await store.issue(id, OWNER, pid);
    const last = (await store.participants(id, OWNER))[0];
    await store.cancelPerson(id, OWNER, pid, last.revision);
    assert.equal(await store.guest(fourth.token), null);
    await assert.rejects(
      () => store.respond(fourth.token, "accepted", 1, last.revision),
      /unavailable/,
    );
  } finally {
    await db.close();
  }
});
test("Sail public enquiries accept only published open voyages, rate-limit, and remain owner-private", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage()),
      hash = "a".repeat(64);
    await assert.rejects(
      () => store.interest(id, person(), hash),
      /not accepting/,
    );
    await store.save(OWNER, "vessel", id, voyage({ published: true }), 1);
    await store.interest(id, { ...person(), website: "spam.example" }, hash);
    assert.equal((await store.enquiries(id, OWNER)).length, 0);
    for (let i = 0; i < 3; i++)
      await store.interest(
        id,
        { ...person(), message: "Synthetic enquiry" },
        hash,
      );
    await assert.rejects(() => store.interest(id, person(), hash), /wait/);
    await assert.rejects(() => store.enquiries(id, OTHER), /not found/);
    assert.equal((await store.enquiries(id, OWNER)).length, 3);
    const enquiry = (await store.enquiries(id, OWNER))[0];
    await store.reviewEnquiry(id, OWNER, enquiry.id);
    assert.equal(
      (await store.enquiries(id, OWNER)).find((x) => x.id === enquiry.id)
        .reviewed,
      true,
    );
    await store.save(
      OWNER,
      "vessel",
      id,
      voyage({ published: true, status: "cancelled" }),
      2,
    );
    await assert.rejects(
      () => store.interest(id, person(), "b".repeat(64)),
      /not accepting/,
    );
  } finally {
    await db.close();
  }
});
