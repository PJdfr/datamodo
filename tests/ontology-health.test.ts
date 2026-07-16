// Unit tests for the ontology-health pure core (GRAPH_PIPELINE.md P2):
// conformance math, new-predicate windows, and the field-proposal growth gate.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOntologyHealth,
  proposeFieldAdditions,
  templateVocabulary,
  type HealthFact,
} from "../lib/datamodo/ontology-health.ts";
import type { KindDef } from "../lib/datamodo/ontology.ts";

const NOW = new Date("2026-07-16T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const INVOICE: KindDef = {
  kind: "invoice",
  label: "Invoice",
  aliases: [],
  fields: [
    { key: "amount", label: "Amount", type: "number", aliases: ["invoice_amount"] },
    { key: "due_date", label: "Due date", type: "date" },
  ],
  relations: [{ predicate: "issued_by", label: "issued by", targetKind: "company", aliases: ["from_company"] }],
  builtin: true,
};

function fact(over: Partial<HealthFact>): HealthFact {
  return { predicate: "amount", subjectKind: "invoice", createdAt: daysAgo(30), current: true, valueType: "number", ...over };
}

test("templateVocabulary: fields + relations + all aliases", () => {
  const v = templateVocabulary(INVOICE);
  for (const p of ["amount", "invoice_amount", "due_date", "issued_by", "from_company"]) assert.ok(v.has(p), p);
  assert.equal(v.has("payment_terms"), false);
});

test("conformance: template predicates, aliases, and universal predicates all conform", () => {
  const h = computeOntologyHealth(
    [
      fact({}), // amount → conforms
      fact({ predicate: "invoice_amount" }), // alias → conforms
      fact({ predicate: "issued_by", valueType: "entity" }), // relation → conforms
      fact({ predicate: "mentions", valueType: "entity" }), // universal → conforms
      fact({ predicate: "payment_terms", valueType: "text" }), // off-template
    ],
    [INVOICE],
    NOW,
  );
  const inv = h.kinds.find((k) => k.kind === "invoice")!;
  assert.equal(inv.factCount, 5);
  assert.equal(inv.conformance, 4 / 5);
  assert.deepEqual(inv.offTemplate, [{ predicate: "payment_terms", count: 1, valueType: "text" }]);
  assert.equal(h.overall.conformance, 4 / 5);
});

test("unregistered kinds report null conformance and never count toward overall", () => {
  const h = computeOntologyHealth(
    [fact({ subjectKind: "gadget", predicate: "battery_life" }), fact({})],
    [INVOICE],
    NOW,
  );
  const gadget = h.kinds.find((k) => k.kind === "gadget")!;
  assert.equal(gadget.conformance, null);
  assert.equal(gadget.offTemplate.length, 0); // no template → nothing is "off" it
  assert.equal(h.overall.conformance, 1); // only the invoice fact counts
});

test("new-predicate window uses FIRST-ever appearance, superseded rows included", () => {
  const h = computeOntologyHealth(
    [
      // First seen 60d ago on a superseded row → NOT new, even though a
      // current row landed yesterday.
      fact({ predicate: "amount", createdAt: daysAgo(60), current: false }),
      fact({ predicate: "amount", createdAt: daysAgo(1) }),
      // Genuinely new this week.
      fact({ predicate: "payment_terms", createdAt: daysAgo(2), valueType: "text" }),
    ],
    [INVOICE],
    NOW,
  );
  const inv = h.kinds.find((k) => k.kind === "invoice")!;
  assert.deepEqual(inv.newPredicates, ["payment_terms"]);
  assert.equal(h.overall.newPredicates, 1);
});

test("kinds sort worst-conformance-first, nulls last", () => {
  const CLEAN: KindDef = { ...INVOICE, kind: "receipt", fields: [{ key: "total", label: "Total", type: "number" }], relations: [] };
  const h = computeOntologyHealth(
    [
      fact({ subjectKind: "receipt", predicate: "total" }), // 100%
      fact({}), fact({ predicate: "weird_one", valueType: "text" }), // 50%
      fact({ subjectKind: "mystery", predicate: "anything" }), // null
    ],
    [INVOICE, CLEAN],
    NOW,
  );
  assert.deepEqual(h.kinds.map((k) => k.kind), ["invoice", "receipt", "mystery"]);
});

test("proposeFieldAdditions: threshold, majority type, relation for entity-valued", () => {
  const facts: HealthFact[] = [
    // payment_terms: 3 current text facts → proposed as a text field
    fact({ predicate: "payment_terms", valueType: "text" }),
    fact({ predicate: "payment_terms", valueType: "text" }),
    fact({ predicate: "payment_terms", valueType: "text" }),
    // approved_by: 3 entity-valued → proposed as a RELATION
    fact({ predicate: "approved_by", valueType: "entity" }),
    fact({ predicate: "approved_by", valueType: "entity" }),
    fact({ predicate: "approved_by", valueType: "entity" }),
    // below threshold → not proposed
    fact({ predicate: "po_number", valueType: "text" }),
    fact({ predicate: "po_number", valueType: "text" }),
    // superseded rows don't count
    fact({ predicate: "old_thing", current: false }),
    fact({ predicate: "old_thing", current: false }),
    fact({ predicate: "old_thing", current: false }),
    // template + universal predicates never propose
    fact({}), fact({}), fact({}),
    fact({ predicate: "mentions", valueType: "entity" }),
    fact({ predicate: "mentions", valueType: "entity" }),
    fact({ predicate: "mentions", valueType: "entity" }),
    // unregistered kind → ignored (category_proposal territory)
    fact({ subjectKind: "gadget", predicate: "battery_life" }),
    fact({ subjectKind: "gadget", predicate: "battery_life" }),
    fact({ subjectKind: "gadget", predicate: "battery_life" }),
  ];
  const out = proposeFieldAdditions(facts, [INVOICE]);
  assert.deepEqual(
    out.map((p) => [p.kind, p.predicate, p.valueType, p.asRelation]),
    [
      ["invoice", "approved_by", "entity", true],
      ["invoice", "payment_terms", "text", false],
    ],
  );
});

test("proposeFieldAdditions: per-kind cap keeps the gate calm", () => {
  const facts: HealthFact[] = [];
  for (const p of ["p1", "p2", "p3", "p4"]) {
    for (let i = 0; i < 3; i++) facts.push(fact({ predicate: p, valueType: "text" }));
  }
  assert.equal(proposeFieldAdditions(facts, [INVOICE]).length, 2); // default maxPerKind
  assert.equal(proposeFieldAdditions(facts, [INVOICE], { maxPerKind: 4 }).length, 4);
});

test("proposeFieldAdditions: majority unit rides along", () => {
  const facts: HealthFact[] = [
    fact({ predicate: "shipping_cost", unit: "USD" }),
    fact({ predicate: "shipping_cost", unit: "USD" }),
    fact({ predicate: "shipping_cost", unit: "EUR" }),
  ];
  const [p] = proposeFieldAdditions(facts, [INVOICE]);
  assert.equal(p.unit, "USD");
  assert.equal(p.valueType, "number");
});
