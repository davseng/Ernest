import test from "node:test";
import assert from "node:assert/strict";
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
test("enquiry shortcut creates an unsent invitation draft once, preserving an existing participant and rejecting other owners/voyages", async () => {
  const { db, store } = await sailDatabase();
  try {
    const trip = await store.save(
        OWNER,
        "vessel",
        null,
        voyage({ published: true }),
      ),
      other = await store.save(
        OTHER,
        "other",
        null,
        voyage({ published: true }),
      );
    await store.interest(
      trip,
      { ...person({ role: "passenger" }), message: "My question" },
      "a".repeat(64),
    );
    const e = (await store.enquiries(trip, OWNER))[0];
    await assert.rejects(
      () => store.inviteEnquiry(trip, OTHER, e.id),
      /not found/,
    );
    await assert.rejects(
      () => store.inviteEnquiry(other, OTHER, e.id),
      /not found/,
    );
    const draft = await store.inviteEnquiry(trip, OWNER, e.id);
    assert.equal(draft.existing, false);
    const p = (await store.participants(trip, OWNER))[0];
    assert.equal(p.role, "passenger");
    assert.equal(p.deliveryStatus, "not_sent");
    assert.equal(p.email, person().email);
    assert.equal((await store.enquiries(trip, OWNER))[0].reviewed, true);
    const issued = await store.issue(trip, OWNER, p.id);
    const repeated = await store.inviteEnquiry(trip, OWNER, e.id);
    assert.equal(repeated.id, p.id);
    assert.equal(repeated.existing, true);
    assert.ok(await store.guest(issued.token));
    assert.equal((await store.participants(trip, OWNER)).length, 1);
    const v = await store.ownerVoyage(trip, OWNER);
    await store.save(
      OWNER,
      "vessel",
      trip,
      { ...v, status: "completed" },
      v.revision,
    );
    await assert.rejects(
      () => store.inviteEnquiry(trip, OWNER, e.id),
      /closed/,
    );
  } finally {
    await db.close();
  }
});
test("changed-plan labels reflect the accepted snapshot and never reveal another role or old private values", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage());
    const pid = await store.addPerson(id, OWNER, person({ role: "passenger" }));
    const issued = await store.issue(id, OWNER, pid);
    await store.respond(issued.token, "accepted", 1, 2);
    const v = await store.ownerVoyage(id, OWNER);
    await store.save(
      OWNER,
      "vessel",
      id,
      { ...v, crewExpectations: "SECRET other-role change" },
      1,
    );
    let g = await store.guest(issued.token);
    assert.deepEqual(g.changes, []);
    assert.equal(JSON.stringify(g).includes("SECRET"), false);
    const v2 = await store.ownerVoyage(id, OWNER);
    await store.save(
      OWNER,
      "vessel",
      id,
      {
        ...v2,
        timingNote: "New plan",
        passengerExpectations: "Current passenger instructions",
        boardingNotes: "Current meeting details",
      },
      2,
    );
    g = await store.guest(issued.token);
    assert.deepEqual(g.changes, [
      "Departure timing",
      "What to expect",
      "Joining details",
    ]);
    assert.equal("after_record" in g, false);
    await db.query(
      "DELETE FROM sail_changes WHERE voyage_id=$1 AND revision=1",
      [id],
    );
    assert.deepEqual((await store.guest(issued.token)).changes, []);
  } finally {
    await db.close();
  }
});
test("invitation copy makes the stage clear and provides contact only on a valid private invitation", async () => {
  const { db, store } = await sailDatabase();
  try {
    const id = await store.save(OWNER, "vessel", null, voyage()),
      pid = await store.addPerson(id, OWNER, person()),
      issued = await store.issue(id, OWNER, pid);
    const { SailInvitationContent } = await loadTypeScript(
      "src/components/sail/invitation-content.tsx",
      {
        "next/navigation": { useRouter: () => ({ refresh() {} }) },
        "@/app/sail/actions": {
          respondToSailInvitation: async () => ({ ok: true, message: "Saved" }),
        },
      },
    );
    const guest = await store.guest(issued.token);
    const html = renderToStaticMarkup(
      createElement(SailInvitationContent, {
        guest,
        token: issued.token,
        contactHref: "mailto:captain@example.invalid",
      }),
    );
    assert.ok(html.includes("You’re invited aboard, Test invitee."));
    assert.ok(html.includes("No account or extra sign-in"));
    assert.ok(html.includes("Count me in"));
    assert.ok(html.includes("I have a question"));
    assert.ok(html.includes("mailto:captain@example.invalid"));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    const accepted = renderToStaticMarkup(
      createElement(SailInvitationContent, {
        guest: {
          ...guest,
          participant: {
            ...guest.participant,
            status: "accepted",
            acceptedRevision: 1,
          },
        },
        token: issued.token,
      }),
    );
    assert.ok(accepted.includes("You’re coming aboard"));
    assert.ok(accepted.includes("acceptance is saved"));
    const declined = renderToStaticMarkup(
      createElement(SailInvitationContent, {
        guest: {
          ...guest,
          participant: { ...guest.participant, status: "declined" },
        },
        token: issued.token,
      }),
    );
    assert.ok(declined.includes("Maybe next time"));
    assert.ok(declined.includes("response is saved"));
  } finally {
    await db.close();
  }
});
test("contact email is validated and its subject encodes trip titles without leaking invitation tokens", async () => {
  const { sailContactHref } = await loadTypeScript(
    "src/domain/sail-journey.ts",
  );
  assert.equal(sailContactHref(undefined, "Trip"), null);
  assert.equal(
    sailContactHref("bad\r\nbcc:elsewhere@example.invalid", "Trip"),
    null,
  );
  assert.equal(
    sailContactHref("captain@example.invalid", "Trip & friends"),
    "mailto:captain@example.invalid?subject=A%20question%20about%20Trip%20%26%20friends",
  );
});
