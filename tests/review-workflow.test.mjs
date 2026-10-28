import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewDatabase,
  OWNER,
  OTHER,
  ITEM,
  SURVEY,
  WORK,
  FOREIGN,
  maintenance,
  draft,
} from "./helpers/review-database.mjs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const { parseDraft } = await loadTypeScript("src/domain/review.ts");

test("review validation preserves unknown dates/hours/stock and rejects impossible or negative inputs", () => {
  const value = parseDraft(
    draft([maintenance({ date: null, engineHours: null })]),
  );
  assert.equal(value.rows[0].date, null);
  assert.equal(value.rows[0].engineHours, null);
  assert.throws(
    () => parseDraft(draft([maintenance({ date: "2026-02-30" })])),
    /real calendar/,
  );
  assert.throws(
    () => parseDraft(draft([maintenance({ spareUsed: "-1" })])),
    /number/,
  );
});
test("impeller event and spare deduction are atomic, persistent and exactly once even after replay", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const id = await store.create(
      "vessel",
      OWNER,
      "I replaced the impeller on October 22, 2026 with an impeller from current spares. Please update our records.",
      draft([maintenance()]),
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM maintenance_events"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("SELECT quantity::text FROM inventory_items")).rows[0]
        .quantity,
      "3",
    );
    const receipt = await store.approve(
      "vessel",
      OWNER,
      id,
      draft([maintenance()]),
    );
    assert.match(
      receipt.changes.map((c) => c.description).join(" "),
      /remaining quantity 2/,
    );
    assert.equal(
      (await store.events("vessel", OWNER))[0].occurred_on,
      "2026-10-22",
    );
    assert.equal((await store.events("vessel", OWNER))[0].engine_hours, null);
    assert.equal(
      (await db.query("SELECT quantity::text FROM inventory_items")).rows[0]
        .quantity,
      "2",
    );
    assert.deepEqual(
      await store.approve("vessel", OWNER, id, { rows: [] }),
      receipt,
    );
    assert.equal((await store.events("vessel", OWNER)).length, 1);
    assert.equal((await store.audit("vessel", OWNER)).length, 1);
    assert.equal(await store.get("vessel", OTHER, id), null);
    await assert.rejects(
      () => store.approve("vessel", OTHER, id, draft([maintenance()])),
      /Asset not found/,
    );
  } finally {
    await db.close();
  }
});
test("unknown balance records consumption without inventing stock; unknown work date stays null", async () => {
  const { db, store } = await reviewDatabase();
  try {
    await db.exec("UPDATE inventory_items SET quantity=NULL");
    const row = maintenance({
      date: null,
      deductSpare: false,
      expectedQuantity: null,
    });
    const id = await store.create(
      "vessel",
      OWNER,
      "Replaced an impeller, date unknown.",
      draft([row]),
    );
    await store.approve("vessel", OWNER, id, draft([row]));
    const event = (await store.events("vessel", OWNER))[0];
    assert.equal(event.occurred_on, null);
    assert.equal(event.spare_used, "1");
    assert.equal(
      (await db.query("SELECT quantity FROM inventory_items")).rows[0].quantity,
      null,
    );
  } finally {
    await db.close();
  }
});
test("a failing related change rolls back event, stock, audit and saved status; excluded rows can then be left unsaved", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const wrong = {
      id: "bad",
      kind: "survey",
      include: true,
      evidence: [],
      reason: "",
      documentId: FOREIGN,
      identifier: "A1",
      priority: "A",
      wording: "Other owner source",
      pageNumber: 1,
      status: "open",
      notes: "",
    };
    const input = draft([maintenance(), wrong]);
    const id = await store.create("vessel", OWNER, "Mixed review", input);
    await assert.rejects(
      () => store.approve("vessel", OWNER, id, input),
      /evidence document/,
    );
    assert.equal(
      (await db.query("SELECT quantity::text FROM inventory_items")).rows[0]
        .quantity,
      "3",
    );
    assert.equal((await store.events("vessel", OWNER)).length, 0);
    assert.equal((await store.audit("vessel", OWNER)).length, 0);
    assert.equal((await store.get("vessel", OWNER, id)).status, "pending");
    await store.approve(
      "vessel",
      OWNER,
      id,
      draft([maintenance(), { ...wrong, include: false }]),
    );
    assert.equal((await store.events("vessel", OWNER)).length, 1);
  } finally {
    await db.close();
  }
});
test("date corrections retain the previous event, do not re-consume spares, and stale revisions fail", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const id = await store.create(
      "vessel",
      OWNER,
      "Original replacement",
      draft([maintenance()]),
    );
    await store.approve("vessel", OWNER, id, draft([maintenance()]));
    const event = (await store.events("vessel", OWNER))[0];
    const correction = maintenance({
      eventId: event.id,
      expectedRevision: 1,
      date: "2026-10-23",
      deductSpare: false,
    });
    const first = await store.create(
      "vessel",
      OWNER,
      "Correct replacement date",
      draft([correction]),
    );
    const stale = await store.create(
      "vessel",
      OWNER,
      "Other date correction",
      draft([correction]),
    );
    await db.exec("UPDATE inventory_items SET quantity=7"); // Date correction does not mutate inventory.
    await store.approve("vessel", OWNER, first, draft([correction]));
    assert.equal(
      (await store.events("vessel", OWNER))[0].occurred_on,
      "2026-10-23",
    );
    assert.equal((await store.events("vessel", OWNER))[0].revision, 2);
    assert.equal(
      (await db.query("SELECT quantity::text FROM inventory_items")).rows[0]
        .quantity,
      "7",
    );
    const audit = await store.audit("vessel", OWNER);
    assert.equal(
      audit[0].changes[0].before.occurred_on.slice(0, 10),
      "2026-10-22",
    );
    await assert.rejects(
      () => store.approve("vessel", OWNER, stale, draft([correction])),
      /event changed/,
    );
  } finally {
    await db.close();
  }
});
test("duplicate maintenance requests are flagged; explicit separate-event approval is required", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const row = maintenance({
      spareItemId: null,
      spareUsed: null,
      deductSpare: false,
    });
    const first = await store.create(
      "vessel",
      OWNER,
      "Repeated request",
      draft([row]),
    );
    await store.approve("vessel", OWNER, first, draft([row]));
    const duplicate = await store.create(
      "vessel",
      OWNER,
      "Repeated request",
      draft([row]),
    );
    await assert.rejects(
      () => store.approve("vessel", OWNER, duplicate, draft([row])),
      /matching maintenance event/,
    );
    await store.approve(
      "vessel",
      OWNER,
      duplicate,
      draft([{ ...row, allowDuplicate: true }]),
    );
    assert.equal((await store.events("vessel", OWNER)).length, 2);
  } finally {
    await db.close();
  }
});
test("knowledge supersession shares the batch transaction and cannot replace a newer owner correction", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const fact = {
      id: "fact",
      kind: "knowledge",
      include: true,
      evidence: [],
      reason: "Owner observation",
      subject: "Forward head",
      predicate: "odor",
      value: "No odor after hose replacement",
      date: "2026-10-22",
    };
    const first = await store.create(
      "vessel",
      OWNER,
      "Head odor resolved",
      draft([fact]),
    );
    await store.approve("vessel", OWNER, first, draft([fact]));
    const second = await store.create(
      "vessel",
      OWNER,
      "Odor returned",
      draft([{ ...fact, value: "Odor returned" }]),
    );
    const stale = await store.create(
      "vessel",
      OWNER,
      "Older proposal",
      draft([{ ...fact, value: "No odor" }]),
    );
    await store.approve(
      "vessel",
      OWNER,
      second,
      draft([{ ...fact, value: "Odor returned" }]),
    );
    await assert.rejects(
      () =>
        store.approve(
          "vessel",
          OWNER,
          stale,
          draft([{ ...fact, value: "No odor" }]),
        ),
      /knowledge changed/,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM owner_knowledge")).rows[0]
        .n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "SELECT value FROM owner_knowledge WHERE superseded_by IS NULL",
        )
      ).rows[0].value,
      "Odor returned",
    );
  } finally {
    await db.close();
  }
});
test("survey review preserves every original A/B item, lets owner exclude items and distinguishes evidence from resolution", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const row = (identifier, priority, wording, status) => ({
      id: identifier,
      kind: "survey",
      include: true,
      evidence: [
        {
          documentId: WORK,
          pageNumber: 2,
          quote: "Replacement of forward head hoses completed.",
        },
      ],
      reason: "Proposed from document evidence",
      documentId: SURVEY,
      identifier,
      priority,
      wording,
      pageNumber: 1,
      status,
      notes:
        status === "no_subsequent_evidence"
          ? "No matching repair found"
          : "Work scope reviewed by owner",
    });
    const rows = [
      row("A1", "A", "Deck core at mast", "partially_addressed"),
      row("A2", "A", "Deck core at windlass", "no_subsequent_evidence"),
      row("B1", "B", "Forward head hose odor", "repair_documented"),
    ];
    const id = await store.create(
      "vessel",
      OWNER,
      "Reconcile every A/B item",
      draft(rows),
    );
    await assert.rejects(
      () =>
        store.approve(
          "vessel",
          OWNER,
          id,
          draft(
            rows.map((r) => (r.id === "B1" ? { ...r, include: false } : r)),
          ),
          true,
        ),
      /excluded/,
    );
    const receipt = await store.approve("vessel", OWNER, id, draft(rows), true);
    assert.equal(receipt.coverage.confirmed, true);
    const report = await store.survey("vessel", OWNER);
    assert.equal(report.length, 3);
    assert.equal(
      report.find((r) => r.identifier === "B1").status,
      "repair_documented",
    );
    assert.equal(
      report.find((r) => r.identifier === "A1").wording,
      "Deck core at mast",
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM document_findings WHERE status='resolved'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal((await store.survey("vessel", OTHER)).length, 0);
  } finally {
    await db.close();
  }
});
test("stale inventory, insufficient stock, cancellation and forged extra rows never produce partial saves", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const id = await store.create(
      "vessel",
      OWNER,
      "Replace impeller",
      draft([maintenance()]),
    );
    await db.exec("UPDATE inventory_items SET quantity=1");
    await assert.rejects(
      () => store.approve("vessel", OWNER, id, draft([maintenance()])),
      /changed since/,
    );
    const tooMany = maintenance({ spareUsed: "2" });
    const second = await store.create(
      "vessel",
      OWNER,
      "Use two spares",
      draft([tooMany]),
    );
    await assert.rejects(
      () => store.approve("vessel", OWNER, second, draft([tooMany])),
      /Not enough/,
    );
    assert.equal((await store.events("vessel", OWNER)).length, 0);
    assert.equal(
      (await db.query("SELECT quantity::text FROM inventory_items")).rows[0]
        .quantity,
      "1",
    );
    const cancelled = await store.create(
      "vessel",
      OWNER,
      "Discard",
      draft([maintenance()]),
    );
    assert.equal(await store.cancel("vessel", OWNER, cancelled), true);
    await assert.rejects(
      () => store.approve("vessel", OWNER, cancelled, draft([maintenance()])),
      /cancelled/,
    );
    const valid = await store.create(
      "vessel",
      OWNER,
      "Original rows",
      draft([maintenance()]),
    );
    await assert.rejects(
      () =>
        store.approve(
          "vessel",
          OWNER,
          valid,
          draft([maintenance(), { ...maintenance(), id: "injected" }]),
        ),
      /does not match/,
    );
  } finally {
    await db.close();
  }
});
test("the planner context snapshot remains pinned even if stock changes during investigation", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const snapshot = {
      inventory: [
        { id: "33333333-3333-4333-8333-333333333333", quantity: "3" },
      ],
      maintenance: [],
      survey: [],
      knowledge: [],
    };
    await db.exec("UPDATE inventory_items SET quantity=2");
    const id = await store.create(
      "vessel",
      OWNER,
      "Planning against earlier context",
      draft([maintenance()]),
      snapshot,
    );
    await assert.rejects(
      () => store.approve("vessel", OWNER, id, draft([maintenance()])),
      /changed since/,
    );
    assert.equal((await store.events("vessel", OWNER)).length, 0);
  } finally {
    await db.close();
  }
});
test("one batch can record distinct repairs using the same spare stock, without treating the whole request as one duplicate event", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const rows = [
      maintenance(),
      maintenance({
        id: "second",
        title: "Second pump impeller replacement",
        componentId: null,
        description: "Replaced an impeller in a second pump.",
      }),
    ];
    const id = await store.create(
      "vessel",
      OWNER,
      "Record both pump repairs",
      draft(rows),
    );
    await store.approve("vessel", OWNER, id, draft(rows));
    assert.equal((await store.events("vessel", OWNER)).length, 2);
    assert.equal(
      (await db.query("SELECT quantity::text FROM inventory_items")).rows[0]
        .quantity,
      "1",
    );
    const manual = maintenance({
      title: "Unrelated later inspection",
      date: "2026-10-24",
      spareItemId: null,
      spareUsed: null,
      deductSpare: false,
    });
    const next = await store.create(
      "vessel",
      OWNER,
      "Owner opened a blank editable update form",
      draft([manual]),
    );
    await store.approve("vessel", OWNER, next, draft([manual]));
    const another = { ...manual, title: "Different work", date: "2026-10-25" };
    const third = await store.create(
      "vessel",
      OWNER,
      "Owner opened a blank editable update form",
      draft([another]),
    );
    await store.approve("vessel", OWNER, third, draft([another]));
    assert.equal((await store.events("vessel", OWNER)).length, 4);
  } finally {
    await db.close();
  }
});
test("unknown consumption and a separately owner-verified remaining count can save together without guessing a starting balance", async () => {
  const { db, store } = await reviewDatabase();
  try {
    await db.exec("UPDATE inventory_items SET quantity=NULL");
    const rows = [
      maintenance({ deductSpare: false, expectedQuantity: null }),
      {
        id: "stock",
        kind: "inventory",
        include: true,
        evidence: [],
        reason: "Owner counted remaining spares after the work",
        itemId: ITEM,
        quantity: "4",
        details: null,
      },
    ];
    const id = await store.create(
      "vessel",
      OWNER,
      "Record work and verified remaining count",
      draft(rows),
    );
    await store.approve("vessel", OWNER, id, draft(rows));
    assert.equal(
      (await db.query("SELECT quantity::text FROM inventory_items")).rows[0]
        .quantity,
      "4",
    );
    assert.equal((await store.events("vessel", OWNER))[0].spare_used, "1");
  } finally {
    await db.close();
  }
});

test("correcting an approved survey identifier updates the same record and retains the original identifier in history", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const row = {
      id: "finding",
      kind: "survey",
      include: true,
      evidence: [],
      reason: "Owner review",
      documentId: SURVEY,
      identifier: "A1",
      priority: "A",
      wording: "Deck core at mast",
      pageNumber: 1,
      status: "needs_review",
      notes: "Check original identifier",
    };
    const first = await store.create(
      "vessel",
      OWNER,
      "Record finding",
      draft([row]),
    );
    await store.approve("vessel", OWNER, first, draft([row]));
    const old = (await store.survey("vessel", OWNER))[0];
    const correction = await store.create(
      "vessel",
      OWNER,
      "Correct identifier",
      draft([row]),
    );
    await store.approve(
      "vessel",
      OWNER,
      correction,
      draft([{ ...row, identifier: "A-1" }]),
    );
    const report = await store.survey("vessel", OWNER);
    assert.equal(report.length, 1);
    assert.equal(report[0].id, old.id);
    assert.equal(report[0].identifier, "A-1");
    assert.equal(report[0].revision, 2);
    const audit = await store.auditForReview("vessel", OWNER, correction);
    assert.equal(audit.changes[0].before.identifier, "A1");
  } finally {
    await db.close();
  }
});

test("driver JSON parameters store objects and legacy string drafts still open and save", async () => {
  const { db } = await reviewDatabase();
  try {
    const { adapt } = await import("./helpers/review-database.mjs");
    const { createReviewStore } = await loadTypeScript(
      "src/data/review-store.ts",
    );
    const store = createReviewStore(adapt(db, true));
    const input = draft([maintenance()]);
    const id = await store.create("vessel", OWNER, "Replace impeller", input);
    assert.equal(
      (
        await db.query(
          "SELECT jsonb_typeof(draft) AS kind FROM update_reviews WHERE id=$1",
          [id],
        )
      ).rows[0].kind,
      "object",
    );
    // Reproduce the representation persisted by the previous inferred-jsonb write.
    const original = (await store.get("vessel", OWNER, id)).draft;
    await db.query("UPDATE update_reviews SET draft=$1::jsonb WHERE id=$2", [
      JSON.stringify(JSON.stringify(original)),
      id,
    ]);
    const reopened = await store.get("vessel", OWNER, id);
    assert.equal(reopened.draft.rows[0].title, "Impeller replacement");
    const receipt = await store.approve("vessel", OWNER, id, reopened.draft);
    assert.equal((await store.get("vessel", OWNER, id)).receipt.reviewId, id);
    assert.deepEqual(
      await store.approve("vessel", OWNER, id, reopened.draft),
      receipt,
    );
    const kinds = (
      await db.query(
        "SELECT jsonb_typeof(receipt) AS receipt,(SELECT jsonb_typeof(changes) FROM update_audit WHERE review_id=$1) AS audit,(SELECT jsonb_typeof(evidence) FROM maintenance_events LIMIT 1) AS evidence FROM update_reviews WHERE id=$1",
        [id],
      )
    ).rows[0];
    assert.deepEqual(kinds, {
      receipt: "object",
      audit: "array",
      evidence: "array",
    });
  } finally {
    await db.close();
  }
});

test("owner can set an unknown spare balance after work without a second deduction", async () => {
  const { db, store } = await reviewDatabase();
  try {
    await db.query("UPDATE inventory_items SET quantity=NULL WHERE id=$1", [
      ITEM,
    ]);
    const row = maintenance({ deductSpare: false, remainingQuantity: "4" });
    const input = draft([row]);
    const id = await store.create(
      "vessel",
      OWNER,
      "Owner counted four remaining",
      input,
    );
    await store.approve("vessel", OWNER, id, input);
    await store.approve("vessel", OWNER, id, input);
    assert.equal(
      (
        await db.query(
          "SELECT quantity::text AS quantity FROM inventory_items WHERE id=$1",
          [ITEM],
        )
      ).rows[0].quantity,
      "4",
    );
    assert.equal((await store.events("vessel", OWNER)).length, 1);
    const other = draft([
      maintenance({
        remainingQuantity: "0",
        deductSpare: true,
        allowDuplicate: true,
      }),
    ]);
    const otherId = await store.create("vessel", OWNER, "Another count", other);
    await assert.rejects(
      () => store.approve("vessel", OWNER, otherId, other),
      /not both/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT quantity::text AS quantity FROM inventory_items WHERE id=$1",
          [ITEM],
        )
      ).rows[0].quantity,
      "4",
    );
  } finally {
    await db.close();
  }
});

test("new spare creation is owner-approved, atomic, deduplicated and linked to maintenance", async () => {
  const { db, store } = await reviewDatabase();
  try {
    const input = draft([
      maintenance({
        spareItemId: null,
        newItemName: "New pump impeller",
        deductSpare: false,
        remainingQuantity: "4",
      }),
    ]);
    const id = await store.create("vessel", OWNER, "New spare", input);
    assert.equal(
      (
        await db.query(
          "SELECT id FROM inventory_items WHERE name='New pump impeller'",
        )
      ).rows.length,
      0,
    );
    await store.approve("vessel", OWNER, id, input);
    await store.approve("vessel", OWNER, id, input);
    const items = (
      await db.query(
        "SELECT id,quantity::text AS quantity,owner_id FROM inventory_items WHERE name='New pump impeller'",
      )
    ).rows;
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, "4");
    assert.equal(items[0].owner_id, OWNER);
    assert.equal(
      (await store.events("vessel", OWNER))[0].spare_item_id,
      items[0].id,
    );
    const duplicate = draft([
      {
        id: "new",
        kind: "inventory",
        include: true,
        evidence: [],
        reason: "",
        itemId: "",
        newItemName: " new  PUMP impeller ",
        quantity: "0",
        details: null,
      },
    ]);
    const dup = await store.create("vessel", OWNER, "Duplicate", duplicate);
    await assert.rejects(
      () => store.approve("vessel", OWNER, dup, duplicate),
      /already exists/,
    );
    const rollback = draft([
      maintenance({
        spareItemId: null,
        newItemName: "Rollback spare",
        deductSpare: false,
        allowDuplicate: true,
      }),
      {
        id: "bad",
        kind: "inventory",
        include: true,
        evidence: [],
        reason: "",
        itemId: "missing",
        quantity: "2",
        details: null,
      },
    ]);
    const failed = await store.create(
      "vessel",
      OWNER,
      "Rollback new spare",
      rollback,
    );
    await assert.rejects(() =>
      store.approve("vessel", OWNER, failed, rollback),
    );
    assert.equal(
      (
        await db.query(
          "SELECT id FROM inventory_items WHERE name='Rollback spare'",
        )
      ).rows.length,
      0,
    );
    const blank = draft([
      {
        id: "new",
        kind: "inventory",
        include: true,
        evidence: [],
        reason: "",
        itemId: "",
        newItemName: "Uncounted spare",
        quantity: null,
        details: null,
      },
    ]);
    const blankId = await store.create(
      "vessel",
      OWNER,
      "New unknown stock",
      blank,
    );
    await store.approve("vessel", OWNER, blankId, blank);
    assert.equal(
      (
        await db.query(
          "SELECT quantity FROM inventory_items WHERE name='Uncounted spare'",
        )
      ).rows[0].quantity,
      null,
    );
  } finally {
    await db.close();
  }
});
