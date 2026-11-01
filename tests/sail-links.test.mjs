import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  await f.db.exec(
    await readFile("migrations/030_sail_optional_email.sql", "utf8"),
  );
  return f;
}
test("named guests can omit email, while public enquiries still require one and supplied emails stay unique", async () => {
  const f = await fixture();
  try {
    const id = await f.store.save(
      OWNER,
      "vessel",
      null,
      voyage({ published: true }),
    );
    const a = await f.store.addPerson(id, OWNER, person({ email: "" })),
      b = await f.store.addPerson(id, OWNER, person({ email: null }));
    assert.notEqual(a, b);
    assert.equal((await f.store.participants(id, OWNER))[0].email, null);
    await f.store.addPerson(id, OWNER, person());
    await assert.rejects(
      () => f.store.addPerson(id, OWNER, person()),
      /already/,
    );
    await assert.rejects(
      () => f.store.interest(id, person({ email: "" }), "a".repeat(64)),
      /Email/,
    );
    await assert.rejects(
      () => f.store.addPerson(id, OWNER, person({ email: "not-email" })),
      /valid email/,
    );
    await assert.rejects(() => f.store.issue(id, OWNER, a), /email address/);
    const issued = await f.store.issue(id, OWNER, a, "link");
    assert.equal((await f.store.guest(issued.token)).participant.id, a);
    await f.store.respond(issued.token, "accepted", 1, 2);
    assert.equal(
      (await f.store.guest(issued.token)).participant.status,
      "accepted",
    );
  } finally {
    await f.db.close();
  }
});
test("link action requires owner and fixed HTTPS origin, returns a single personal link without SMTP, and preserves revocation/cooldown", async () => {
  const f = await fixture();
  try {
    const id = await f.store.save(OWNER, "vessel", null, voyage()),
      pid = await f.store.addPerson(id, OWNER, person({ email: "" }));
    let session = { user: { id: OWNER } },
      mailCalls = 0;
    const actions = await loadTypeScript("src/app/sail/actions.ts", {
      "@/auth": { auth: async () => session },
      "@/data/sail": { sail: () => f.store },
      "@/data/sail-mail": {
        sailMailProblem: () => {
          mailCalls++;
          return "Disabled";
        },
        sendSailInvitation: async () => {
          mailCalls++;
        },
      },
      "@/data/sail-invitation-url": {
        sailInvitationOrigin: () => "https://sail.example.invalid",
      },
      "next/cache": { revalidatePath() {} },
      "next/headers": { headers: async () => new Headers() },
    });
    session = { user: { id: OTHER } };
    assert.equal((await actions.createSailPersonLink(id, pid)).ok, false);
    session = null;
    assert.equal((await actions.createSailPersonLink(id, pid)).ok, false);
    session = { user: { id: OWNER } };
    const link = await actions.createSailPersonLink(id, pid);
    assert.equal(link.ok, true);
    assert.match(
      link.invitationUrl,
      /^https:\/\/sail\.example\.invalid\/sail\/invitations\/[a-f0-9]{64}$/,
    );
    const token = link.invitationUrl.split("/").at(-1);
    const row = (
      await f.db.query(
        "SELECT token_hash,delivery_status FROM sail_participants WHERE id=$1",
        [pid],
      )
    ).rows[0];
    assert.notEqual(row.token_hash, token);
    assert.equal(row.delivery_status, "not_sent");
    assert.equal(mailCalls, 0);
    assert.equal((await actions.createSailPersonLink(id, pid)).ok, false);
    await f.db.query(
      "UPDATE sail_participants SET last_attempt_at=now()-interval '2 minutes' WHERE id=$1",
      [pid],
    );
    const fresh = await actions.createSailPersonLink(id, pid);
    assert.equal(fresh.ok, true);
    assert.equal(await f.store.guest(token), null);
    assert.equal(mailCalls, 0);
    const p = (await f.store.participants(id, OWNER))[0];
    await f.store.cancelPerson(id, OWNER, pid, p.revision);
    assert.equal(
      await f.store.guest(fresh.invitationUrl.split("/").at(-1)),
      null,
    );
  } finally {
    await f.db.close();
  }
});
test("fixed invitation origin rejects malformed origins and rollout only relaxes email nullability", async () => {
  const previous = process.env.SAIL_BASE_URL;
  try {
    const { sailInvitationOrigin } = await loadTypeScript(
      "src/data/sail-invitation-url.ts",
    );
    for (const value of [
      "",
      "http://example.invalid",
      "https://example.invalid/sail",
      "https://user:pass@example.invalid",
      "https://example.invalid?x=1",
    ]) {
      process.env.SAIL_BASE_URL = value;
      assert.throws(() => sailInvitationOrigin(), /not configured/);
    }
    process.env.SAIL_BASE_URL = " https://example.invalid/ ";
    assert.equal(sailInvitationOrigin(), "https://example.invalid");
  } finally {
    if (previous === undefined) delete process.env.SAIL_BASE_URL;
    else process.env.SAIL_BASE_URL = previous;
  }
  const { db } = await sailDatabase();
  try {
    await db.exec(
      "CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const text = await readFile(
      "scripts/sail/link-sql-editor/01-apply-030.sql",
      "utf8",
    );
    assert.equal(
      text
        .split("-- BEGIN UNCHANGED MIGRATION 030\n")[1]
        .split("-- END UNCHANGED MIGRATION 030")[0],
      await readFile("migrations/030_sail_optional_email.sql", "utf8"),
    );
    const apply = text.replace(
      "current_database()<>'neondb'",
      "current_database()<>current_database()",
    );
    await db.exec(apply);
    await db.exec(
      await readFile("scripts/sail/link-sql-editor/02-verify.sql", "utf8"),
    );
    await assert.rejects(() => db.exec(apply), /already recorded/);
    await db.exec("ROLLBACK");
  } finally {
    await db.close();
  }
});
