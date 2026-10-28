import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
import {
  OWNER,
  ITEM,
  SURVEY,
  WORK,
  FOREIGN,
  maintenance,
} from "./helpers/review-database.mjs";
const context = {
  asset: { id: "vessel", name: "Synthetic", systems: [] },
  inventory: [{ id: ITEM, name: "Impeller", quantity: null }],
  locations: [],
  logs: [{ title: "Earlier repair", body: "Owner maintenance history" }],
  knowledge: [],
  documents: [
    { id: SURVEY, title: "Survey" },
    { id: WORK, title: "Yard order" },
  ],
  findings: [],
  procedures: [],
  maintenance: [],
  survey: [],
};
const call = (name, args, id) => ({
  type: "function_call",
  call_id: id,
  name,
  arguments: JSON.stringify(args),
});
const response = (...output) => ({ output, output_text: "" });
async function planner(outputs, stubs = {}, inspect = () => {}) {
  let step = 0;
  class AI {
    responses = {
      create: async (args) => {
        inspect(args);
        if (step >= outputs.length) throw Error("Unexpected model turn");
        return outputs[step++];
      },
    };
  }
  return loadTypeScript("src/data/review-planner.ts", {
    openai: { default: AI },
    "@/data/documents": {},
    "./documents": {
      getDocumentPages: async () => [],
      getDocumentForAsset: async () => null,
      ...stubs.documents,
    },
    "./document-context": { getErnestDocumentContext: async () => [] },
    "./document-storage": {
      readDocument: async () => Buffer.from("%PDF-synthetic"),
    },
  });
}
test("one planner reads survey and work-order evidence before preparing the full owner review; no records are written", async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-only";
  try {
    const rows = ["A1", "A2", "B1"].map((id, index) => ({
      id,
      kind: "survey",
      include: true,
      evidence: [{ documentId: WORK, pageNumber: 2, quote: "Hoses replaced" }],
      reason: "Review matching repair scope",
      documentId: SURVEY,
      identifier: id,
      priority: id[0],
      wording: [
        "Deck core at mast",
        "Deck core at windlass",
        "Forward head hose odor",
      ][index],
      pageNumber: 1,
      status: index === 2 ? "repair_documented" : "no_subsequent_evidence",
      notes:
        index === 2
          ? "Hose replacement documented; odor resolution needs owner confirmation."
          : "No specific repair evidence found.",
    }));
    const outputs = [
      response(
        call(
          "read_document",
          { documentId: SURVEY, startPage: 1, endPage: 2 },
          "survey",
        ),
      ),
      response(
        call(
          "read_document",
          { documentId: WORK, startPage: 1, endPage: 2 },
          "work",
        ),
      ),
      response(
        call(
          "prepare_update",
          {
            title: "Survey A/B review",
            summary: "Review evidence, not automatic resolution.",
            missing: [],
            coverage: "Review exact scope.",
            rows,
          },
          "draft",
        ),
      ),
    ];
    let reads = 0,
      captured;
    const { planReview } = await planner(
      outputs,
      {
        documents: {
          getDocumentPages: async (id, asset, owner) => {
            assert.equal(asset, "vessel");
            assert.equal(owner, OWNER);
            reads++;
            return [
              {
                pageNumber: 1,
                text:
                  id === SURVEY
                    ? "A1 Deck core at mast. A2 Deck core at windlass. B1 Forward head hose odor."
                    : "Yard work order",
              },
              { pageNumber: 2, text: "Hoses replaced" },
            ];
          },
        },
      },
      (args) => {
        captured = args;
      },
    );
    const result = await planReview(
      "vessel",
      OWNER,
      "Update records from repairs and list all A/B items",
      "",
      context,
    );
    assert.equal(reads, 2);
    assert.equal(result.draft.rows.length, 3);
    assert.equal(result.draft.rows[2].status, "repair_documented");
    assert.match(result.draft.coverage, /not independently verified/);
    assert.match(captured.instructions, /owner decides what is definitive/i);
    assert.match(captured.instructions, /seasoned shipmate/);
    assert.ok(captured.tools.some((t) => t.name === "prepare_update"));
    assert.ok(!captured.tools.some((t) => /save|delete|approve/.test(t.name)));
  } finally {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  }
});
test("the impeller statement creates an editable event with the explicit date and unknown stock untouched", async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-only";
  try {
    const row = maintenance({
      deductSpare: true,
      expectedQuantity: "invented",
    });
    const { planReview } = await planner([
      response(
        call(
          "prepare_update",
          {
            title: "Impeller replacement",
            summary: "Review work date and spare use.",
            missing: ["Choose equipment if needed; hours are optional."],
            rows: [row],
          },
          "form",
        ),
      ),
    ]);
    const result = await planReview(
      "vessel",
      OWNER,
      "I replaced the impeller on October 22, 2026 with an impeller from current spares. Please update our records.",
      "",
      context,
    );
    assert.equal(result.draft.rows[0].date, "2026-10-22");
    assert.equal(result.draft.rows[0].engineHours, null);
    assert.equal(result.draft.rows[0].deductSpare, false);
    assert.equal(result.draft.rows[0].expectedQuantity, null);
    assert.match(result.answer, /nothing is definitive/);
  } finally {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  }
});
test("unknown source IDs and unread survey pages are rejected without exposing other owners evidence", async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-only";
  try {
    let read = false;
    let observedError = false;
    const { planReview } = await planner(
      [
        response(
          call(
            "read_document",
            { documentId: FOREIGN, startPage: 1, endPage: 1 },
            "bad",
          ),
        ),
        response(
          call(
            "prepare_update",
            {
              rows: [
                {
                  kind: "survey",
                  documentId: SURVEY,
                  identifier: "A1",
                  priority: "A",
                  wording: "not read",
                  pageNumber: 1,
                  status: "open",
                },
              ],
            },
            "bad-form",
          ),
        ),
        { output: [], output_text: "I need to read the survey first." },
      ],
      {
        documents: {
          getDocumentPages: async () => {
            read = true;
            return [];
          },
        },
      },
      (args) => {
        if (
          args.input.some(
            (x) =>
              x.type === "function_call_output" && JSON.parse(x.output).error,
          )
        )
          observedError = true;
      },
    );
    const result = await planReview(
      "vessel",
      OWNER,
      "List A/B survey findings",
      "",
      context,
    );
    assert.equal(read, false);
    assert.equal(result.draft, undefined);
    assert.equal(observedError, true);
  } finally {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  }
});
test("ordinary advice uses the same supplied maintenance/inventory/evidence context and cannot report a save", async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-only";
  try {
    let seen;
    const { planReview } = await planner(
      [{ output: [], output_text: "Updated for the boat: impeller replaced." }],
      {},
      (args) => {
        seen = JSON.parse(args.input[0].content);
      },
    );
    const result = await planReview(
      "vessel",
      OWNER,
      "What should I inspect?",
      "",
      context,
    );
    assert.equal(seen.records.logs[0].title, "Earlier repair");
    assert.equal(seen.records.inventory[0].id, ITEM);
    assert.match(result.answer, /No change was saved/);
  } finally {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  }
});
test("preserved equipment photos remain owner-scoped read tools, with visible unverified evidence links", async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-only";
  try {
    const photoId = "77777777-7777-4777-8777-777777777777";
    let captured;
    class AI {
      responses = {
        create: async (args) => {
          captured = args;
          return args.input.some((x) => x.type === "function_call_output")
            ? {
                output: [],
                output_text:
                  "The photo suggests an impeller housing; confirm the label.",
              }
            : response(call("read_photo", { photoId }, "photo"));
        },
      };
    }
    const { planReview } = await loadTypeScript("src/data/review-planner.ts", {
      openai: { default: AI },
      "./photos": {
        getPhoto: async (id, asset, owner) => {
          assert.equal(owner, OWNER);
          return {
            id,
            title: "Pump label",
            contentType: "image/jpeg",
            sizeBytes: 5,
            storageKey: "synthetic",
          };
        },
      },
      "./documents": {
        getDocumentPages: async () => [],
        getDocumentForAsset: async () => null,
      },
      "./document-context": { getErnestDocumentContext: async () => [] },
      "./document-storage": { readDocument: async () => Buffer.from("photo") },
    });
    const result = await planReview(
      "vessel",
      OWNER,
      "Inspect the pump photo",
      "",
      { ...context, photos: [{ id: photoId, title: "Pump label" }] },
    );
    assert.equal(result.photos[0].photoId, photoId);
    assert.ok(
      captured.input.some(
        (x) =>
          x.role === "user" &&
          Array.isArray(x.content) &&
          x.content.some((c) => c.type === "input_image"),
      ),
    );
  } finally {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  }
});
