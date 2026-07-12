// Unit tests for the derive-a-table pure core (lib/datamodo/derive-table.ts):
// graph schema summary, spec validation, deterministic row building.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeGraph,
  renderGraphSummary,
  parseDeriveSpec,
  buildDerivedTable,
  buildDeriveTablePrompt,
  type DeriveTableSpec,
} from "../lib/datamodo/derive-table.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const attr = (predicate: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const rel = (predicate: string, refId: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = []): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: facts.length, bodyMd: null, graphPin: null,
});

// Two companies; three invoices pointing at them; one person at Acme.
const WORLD: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Inc", [attr("industry", "logistics")]),
  ent("bw", "company", "Brightwave", []),
  ent("i1", "invoice", "INV-1", [attr("amount", "12,000 USD"), rel("issued_by", "acme", "Acme Inc")]),
  ent("i2", "invoice", "INV-2", [attr("amount", "6500 USD"), rel("issued_by", "acme", "Acme Inc")]),
  ent("i3", "invoice", "INV-3", [attr("amount", "900 USD"), rel("issued_by", "bw", "Brightwave")]),
  ent("bob", "person", "Bob", [rel("works_for", "acme", "Acme Inc")]),
];

test("summarizeGraph: kinds with attrs and both relation directions, count-ordered", () => {
  const s = summarizeGraph(WORLD);
  assert.deepEqual(s.map((k) => k.kind), ["invoice", "company", "person"]);
  const company = s.find((k) => k.kind === "company")!;
  assert.equal(company.count, 2);
  assert.deepEqual(company.attrs.map((a) => a.predicate), ["industry"]);
  assert.deepEqual(company.relsIn.map((r) => [r.predicate, r.count]), [["issued_by", 3], ["works_for", 1]]);
  const invoice = s.find((k) => k.kind === "invoice")!;
  assert.deepEqual(invoice.relsOut[0], { predicate: "issued_by", count: 3, targetKinds: ["company"] });
  // The summary renders schema, not data rows.
  const text = renderGraphSummary(s);
  assert.match(text, /kind "company" \(2 entities\)/);
  assert.match(text, /relation in "issued_by" ×3 ← invoice/);
});

test("parseDeriveSpec: sanitizes labels→keys, fills defaults, prepends the label column", () => {
  const summary = summarizeGraph(WORLD);
  const r = parseDeriveSpec({
    name: "Companies",
    kind: "company",
    columns: [
      { label: "Open invoices", type: "number", source: { from: "relation", predicate: "issued_by", agg: "count" } },
      { label: "Industry !!", source: { from: "attr", predicate: "industry" } },
      { label: "Made up", source: { from: "attr", predicate: "not_a_predicate" } }, // invented → dropped
    ],
  }, summary);
  assert.ok(r.spec, r.error);
  const spec = r.spec!;
  assert.equal(spec.columns[0].source.from, "label", "row name always present");
  assert.deepEqual(spec.columns.map((c) => c.key), ["name", "open_invoices", "industry"]);
  const relCol = spec.columns[1];
  assert.equal(relCol.type, "number", "count columns are numbers");
  assert.deepEqual(relCol.source, { from: "relation", predicate: "issued_by", direction: "any", agg: "count" });
});

test("parseDeriveSpec: unknown kind or model-declared error refuse cleanly", () => {
  const summary = summarizeGraph(WORLD);
  assert.match(parseDeriveSpec({ kind: "spaceship", columns: [] }, summary).error!, /unknown kind/);
  assert.equal(parseDeriveSpec({ error: "nothing matches" }, summary).error, "nothing matches");
  assert.match(parseDeriveSpec({ kind: "company", columns: [] }, summary).error!, /no usable columns/);
});

test("buildDerivedTable: deterministic rows — attrs, both-direction relations, counts, numbers", () => {
  const spec: DeriveTableSpec = {
    name: "Companies",
    description: "",
    kind: "company",
    columns: [
      { key: "name", label: "Name", type: "text", source: { from: "label" } },
      { key: "industry", label: "Industry", type: "text", source: { from: "attr", predicate: "industry" } },
      { key: "invoices", label: "Invoices", type: "text", source: { from: "relation", predicate: "issued_by", direction: "in", agg: "list" } },
      { key: "n", label: "Invoice count", type: "number", source: { from: "relation", predicate: "issued_by", direction: "any", agg: "count" } },
      { key: "people", label: "People", type: "text", source: { from: "relation", predicate: "works_for", direction: "any", agg: "list" } },
    ],
  };
  const t = buildDerivedTable(WORLD, spec);
  assert.deepEqual(t.columns.map((c) => c.key), ["name", "industry", "invoices", "n", "people"]);
  assert.deepEqual(t.rows, [
    { entityId: "acme", data: { name: "Acme Inc", industry: "logistics", invoices: "INV-1; INV-2", n: 2, people: "Bob" } },
    { entityId: "bw", data: { name: "Brightwave", industry: null, invoices: "INV-3", n: 1, people: null } },
  ]);
  assert.deepEqual(buildDerivedTable(WORLD, spec), t, "same graph, same table");
});

test("buildDerivedTable: number columns parse the first numeric out of messy values", () => {
  const spec: DeriveTableSpec = {
    name: "Invoices", description: "", kind: "invoice",
    columns: [
      { key: "name", label: "Name", type: "text", source: { from: "label" } },
      { key: "amount", label: "Amount", type: "number", source: { from: "attr", predicate: "amount" } },
    ],
  };
  const t = buildDerivedTable(WORLD, spec);
  assert.deepEqual(t.rows.map((r) => r.data.amount), [12000, 6500, 900]);
});

test("buildDeriveTablePrompt: carries the request and the schema, demands JSON", () => {
  const { system, user } = buildDeriveTablePrompt("companies and what they owe", summarizeGraph(WORLD));
  assert.match(system, /ONLY JSON/);
  assert.match(user, /companies and what they owe/);
  assert.match(user, /kind "invoice"/);
});
