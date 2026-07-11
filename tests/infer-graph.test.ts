// Unit tests for the spreadsheet→graph inference core (infer-graph-core.ts):
// heuristics, the preview step's user OVERRIDES, and the cross-row reference
// dedupe (combineExtractions). The merge itself reuses ingestExtraction.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  combineExtractions,
  inferGraphFromTable,
  kindFrom,
  singularize,
  type InferInput,
} from "../lib/datamodo/infer-graph-core.ts";

const INPUT: InferInput = {
  tableName: "Invoices",
  columns: [
    { key: "invoice", label: "Invoice", type: "text" },
    { key: "client", label: "Client", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "due", label: "Due", type: "date" },
    { key: "notes", label: "Notes", type: "text" },
  ],
  rows: [
    { invoice: "INV-1", client: "Acme", amount: 100, due: "2026-01-02", notes: "rush" },
    { invoice: "INV-2", client: "Acme", amount: 250, due: "2026-02-02", notes: "" },
    { invoice: "INV-3", client: "Brightwave", amount: 80, due: "2026-03-02", notes: "q1" },
  ],
};

test("heuristics: subject, reference, attributes, kinds", () => {
  const g = inferGraphFromTable(INPUT);
  assert.equal(g.schema.entityKind, "invoice");
  assert.equal(g.schema.subjectColumn, "invoice");
  assert.deepEqual(g.schema.references.map((r) => r.column), ["client"]);
  assert.deepEqual(g.schema.attributes.map((a) => a.column), ["amount", "due", "notes"]);
  assert.equal(g.extractions.length, 3);
  assert.equal(singularize("companies"), "company");
  assert.equal(kindFrom("Vendors"), "company");
});

test("overrides: entity kind, subject column, role flips, ref kind, skip", () => {
  const g = inferGraphFromTable(INPUT, {
    overrides: {
      entityKind: "Bill",
      subjectColumn: "client",
      columns: {
        invoice: { role: "reference", kind: "receipt" },
        notes: { role: "skip" },
        amount: { role: "attribute" },
      },
    },
  });
  assert.equal(g.schema.entityKind, "bill");
  assert.equal(g.schema.subjectColumn, "client");
  const ref = g.schema.references.find((r) => r.column === "invoice");
  assert.equal(ref?.kind, "receipt");
  assert.deepEqual(g.schema.skipped, ["notes"]);
  assert.ok(!g.schema.attributes.some((a) => a.column === "notes"), "skipped column produces nothing");
  // Subjects are now the clients; INV values became references.
  assert.ok(g.subjectLabels.includes("acme"));
});

test("overrides: forcing a telltale reference column to attribute wins", () => {
  const g = inferGraphFromTable(INPUT, { overrides: { columns: { client: { role: "attribute" } } } });
  assert.equal(g.schema.references.length, 0);
  assert.ok(g.schema.attributes.some((a) => a.column === "client"));
});

test("combineExtractions: repeated references collapse to ONE entity", () => {
  const g = inferGraphFromTable(INPUT);
  const combined = combineExtractions(g.extractions);
  // 3 subjects + 2 distinct clients (Acme deduped across rows) = 5 entities.
  assert.equal(combined.entities.length, 5);
  const acmes = combined.entities.filter((e) => e.label === "Acme");
  assert.equal(acmes.length, 1);
  // Both INV-1 and INV-2 point their client fact at the SAME local id.
  const acmeId = acmes[0].localId;
  const clientFacts = combined.facts.filter((f) => f.predicate === "client" && f.value.kind === "entity");
  assert.equal(clientFacts.filter((f) => f.value.kind === "entity" && f.value.entityLocalId === acmeId).length, 2);
  // Fact count survives the combine (nothing dropped).
  assert.equal(combined.facts.length, g.factCount);
});

test("combineExtractions: same label but different natural keys stays separate", () => {
  const g = inferGraphFromTable({
    tableName: "Contacts",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
    ],
    rows: [
      { name: "Sam Lee", email: "sam@acme.com" },
      { name: "Sam Lee", email: "sam@brightwave.io" },
    ],
  });
  const combined = combineExtractions(g.extractions);
  assert.equal(combined.entities.filter((e) => e.label === "Sam Lee").length, 2, "distinct identities never collapse silently");
});
