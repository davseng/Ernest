import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const { boatSummary } = await loadTypeScript("src/domain/boat-summary.ts");
test("readable knowledge is a non-mutating view of confirmed records, with unknown dates/balances and superseded facts kept distinct", () => {
  const context = {
    asset: {
      name: "Synthetic",
      make: "",
      model: "",
      year: 2020,
      summary: "Owner profile",
      systems: [],
    },
    knowledge: [
      {
        subject: "Head",
        predicate: "odor",
        value: "Resolved",
        kind: "current_fact",
        effectiveOn: "2020-01-01",
        supersededBy: null,
      },
      {
        subject: "Head",
        predicate: "odor",
        value: "Old unresolved condition",
        kind: "current_fact",
        effectiveOn: "2019-01-01",
        supersededBy: "replacement",
      },
    ],
    inventory: [
      { name: "Impeller", quantity: null, locations: [], details: null },
      { name: "Filters", quantity: "0", locations: [], details: null },
    ],
    locations: [],
    maintenance: [
      {
        title: "Replacement",
        description: "Owner approved work",
        occurred_on: null,
        revision: 1,
      },
    ],
    logs: [],
    survey: [],
    documents: [{ title: "Historical work order", documentDate: null }],
    lifecycles: [],
  };
  const before = JSON.stringify(context);
  const text = boatSummary(context);
  assert.match(text, /Head \/ odor: Resolved/);
  assert.doesNotMatch(text, /Old unresolved condition/);
  assert.match(text, /Impeller: quantity unknown/);
  assert.match(text, /Filters: quantity 0/);
  assert.match(text, /Work date unknown/);
  assert.match(text, /not automatically approved current facts/);
  assert.equal(JSON.stringify(context), before);
});
