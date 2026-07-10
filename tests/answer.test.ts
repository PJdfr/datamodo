// Unit tests for the pure half of grounded search answers (lib/datamodo/answer.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnswerContext, citedSources, type AnswerSource } from "../lib/datamodo/answer.ts";
import type { SearchHit, KnowledgeHit } from "../lib/datamodo/search.ts";

const HIT: SearchHit = {
  rowId: "r1",
  datasetId: "ds1",
  datasetName: "Invoices",
  score: 2,
  cells: [
    { column: "client", label: "Client", value: "Acme Inc", matched: true },
    { column: "amount", label: "Amount", value: "12000", matched: false },
    { column: "notes", label: "Notes", value: "", matched: false },
  ],
};

const ENTITY: KnowledgeHit = {
  id: "e1",
  label: "INV-4417",
  kind: "invoice",
  score: 2,
  facts: [
    { predicate: "amount", value: "18500 USD", ref: false, matched: true },
    { predicate: "issued_by", value: "Brightwave", ref: true, matched: false },
  ],
};

test("buildAnswerContext: entities first, then rows, numbered consecutively", () => {
  const { context, sources } = buildAnswerContext([HIT], [ENTITY]);
  const lines = context.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[1\] Known invoice "INV-4417": amount 18500 USD · issued by → Brightwave$/);
  assert.match(lines[1], /^\[2\] Row in table "Invoices": Client=Acme Inc · Amount=12000$/); // empty cell skipped
  assert.deepEqual(sources.map((s) => [s.n, s.type]), [[1, "entity"], [2, "row"]]);
  assert.equal(sources[1].datasetId, "ds1");
  assert.equal(sources[0].entityId, "e1");
  assert.equal(sources[1].label, "Invoices — Acme Inc");
});

test("buildAnswerContext: nothing to ground on → empty context", () => {
  const { context, sources } = buildAnswerContext([], []);
  assert.equal(context, "");
  assert.equal(sources.length, 0);
});

test("citedSources: keeps only cited, in first-mention order, deduped", () => {
  const sources: AnswerSource[] = [1, 2, 3].map((n) => ({ n, type: "row", label: `s${n}`, datasetId: null, entityId: null }));
  const cited = citedSources("Total is $30,500 [3][1] across two invoices [3].", sources);
  assert.deepEqual(cited?.map((s) => s.n), [3, 1]);
});

test("citedSources: uncited or unknown-number answers are rejected", () => {
  const sources: AnswerSource[] = [{ n: 1, type: "row", label: "s1", datasetId: null, entityId: null }];
  assert.equal(citedSources("It is probably around $30k.", sources), null);
  assert.equal(citedSources("See [7] for details.", sources), null);
});
