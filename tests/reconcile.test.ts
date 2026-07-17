// Unit tests for within-extraction reconciliation (lib/datamodo/reconcile-core.ts):
// the deterministic, zero-LLM pass that keeps "author: xxx, author: yyy" from
// collapsing into a last-one-wins supersession chain. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  declaredCardinality,
  parseLooseDate,
  parseLooseNumber,
  reconcileExtraction,
} from "../lib/datamodo/reconcile-core.ts";
import { DEFAULT_KINDS } from "../lib/datamodo/ontology.ts";
import type { Extraction, ExtractedFact } from "../lib/datamodo/knowledge.ts";

const text = (t: string): ExtractedFact["value"] => ({ kind: "text", text: t });

test("declaredCardinality: fields default one, relations default many, declarations win", () => {
  // invoice.amount — plain field → one
  assert.equal(declaredCardinality(DEFAULT_KINDS, "invoice", "amount"), "one");
  // document.author — declared many
  assert.equal(declaredCardinality(DEFAULT_KINDS, "document", "author"), "many");
  // document.mentions — relation, defaults many
  assert.equal(declaredCardinality(DEFAULT_KINDS, "document", "mentions"), "many");
  // invoice.issued_by — relation declared one
  assert.equal(declaredCardinality(DEFAULT_KINDS, "invoice", "issued_by"), "one");
  // off-template → null (heuristics decide)
  assert.equal(declaredCardinality(DEFAULT_KINDS, "invoice", "weather"), null);
  assert.equal(declaredCardinality(DEFAULT_KINDS, "spaceship", "speed"), null);
});

test("reconcile: multiple values for an undeclared predicate promote to many — nobody wins by being last", () => {
  const x: Extraction = {
    entities: [{ localId: "e1", kind: "thing", label: "Widget" }],
    facts: [
      { subjectLocalId: "e1", predicate: "color", cardinality: "one", value: text("red") },
      { subjectLocalId: "e1", predicate: "color", cardinality: "one", value: text("blue") },
    ],
  };
  const { extraction, stats } = reconcileExtraction(x);
  assert.equal(extraction.facts.length, 2);
  assert.ok(extraction.facts.every((f) => f.cardinality === "many"));
  assert.equal(stats.promotedToMany, 2);
});

test("reconcile: a declared-many field keeps every value, even a lone one arrives as many", () => {
  const x: Extraction = {
    entities: [{ localId: "e1", kind: "document", label: "Paper" }],
    facts: [
      { subjectLocalId: "e1", predicate: "author", cardinality: "one", value: text("Ada Lovelace"), confidence: 0.9 },
      { subjectLocalId: "e1", predicate: "author", cardinality: "one", value: text("Alan Turing"), confidence: 0.9 },
      { subjectLocalId: "e1", predicate: "title", cardinality: "one", value: text("On Computable Numbers") },
    ],
  };
  const { extraction } = reconcileExtraction(x, DEFAULT_KINDS);
  const authors = extraction.facts.filter((f) => f.predicate === "author");
  assert.equal(authors.length, 2);
  assert.ok(authors.every((f) => f.cardinality === "many"));
  // title stays single-valued
  assert.equal(extraction.facts.find((f) => f.predicate === "title")?.cardinality, "one");

  // a SINGLE author still lands as many — so later messages accumulate
  const solo = reconcileExtraction(
    { entities: x.entities, facts: [x.facts[0]] },
    DEFAULT_KINDS,
  );
  assert.equal(solo.extraction.facts[0].cardinality, "many");
});

test("reconcile: a declared-one slot with conflicting same-message values keeps the most confident", () => {
  const x: Extraction = {
    entities: [{ localId: "e1", kind: "invoice", label: "INV-9" }],
    facts: [
      { subjectLocalId: "e1", predicate: "amount", cardinality: "one", value: { kind: "number", num: 100 }, confidence: 0.4 },
      { subjectLocalId: "e1", predicate: "amount", cardinality: "one", value: { kind: "number", num: 950 }, confidence: 0.9 },
    ],
  };
  const { extraction, stats } = reconcileExtraction(x, DEFAULT_KINDS);
  const amounts = extraction.facts.filter((f) => f.predicate === "amount");
  assert.equal(amounts.length, 1);
  assert.equal(amounts[0].value.kind === "number" && amounts[0].value.num, 950);
  assert.equal(amounts[0].cardinality, "one");
  assert.equal(stats.conflictsResolved, 1);
});

test("reconcile: a declared-one relation resolves the same way; default-many relations accumulate", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "invoice", label: "INV-9" },
      { localId: "e2", kind: "company", label: "Acme" },
      { localId: "e3", kind: "company", label: "Globex" },
    ],
    facts: [
      { subjectLocalId: "e1", predicate: "issued_by", cardinality: "one", value: { kind: "entity", entityLocalId: "e2" }, confidence: 0.9 },
      { subjectLocalId: "e1", predicate: "issued_by", cardinality: "one", value: { kind: "entity", entityLocalId: "e3" }, confidence: 0.5 },
    ],
  };
  const one = reconcileExtraction(x, DEFAULT_KINDS);
  assert.equal(one.extraction.facts.length, 1);
  assert.equal(one.extraction.facts[0].value.kind === "entity" && one.extraction.facts[0].value.entityLocalId, "e2");

  const doc: Extraction = {
    entities: [
      { localId: "d", kind: "document", label: "Report" },
      { localId: "a", kind: "company", label: "Acme" },
      { localId: "b", kind: "company", label: "Globex" },
    ],
    facts: [
      { subjectLocalId: "d", predicate: "mentions", cardinality: "one", value: { kind: "entity", entityLocalId: "a" } },
      { subjectLocalId: "d", predicate: "mentions", cardinality: "one", value: { kind: "entity", entityLocalId: "b" } },
    ],
  };
  const many = reconcileExtraction(doc, DEFAULT_KINDS);
  assert.equal(many.extraction.facts.length, 2);
  assert.ok(many.extraction.facts.every((f) => f.cardinality === "many"));
});

test("reconcile: exact repeats collapse into one fact with the max confidence", () => {
  const x: Extraction = {
    entities: [{ localId: "e1", kind: "thing", label: "Widget" }],
    facts: [
      { subjectLocalId: "e1", predicate: "color", value: text("Red"), confidence: 0.5, snippet: "the red widget" },
      { subjectLocalId: "e1", predicate: "color", value: text("  red "), confidence: 0.9 }, // same value modulo trim/case
    ],
  };
  const { extraction, stats } = reconcileExtraction(x);
  assert.equal(extraction.facts.length, 1);
  assert.equal(extraction.facts[0].confidence, 0.9);
  assert.equal(extraction.facts[0].snippet, "the red widget");
  assert.equal(stats.mergedDuplicates, 1);
});

test("reconcile: broken and self references drop instead of failing the whole item", () => {
  const x: Extraction = {
    entities: [{ localId: "e1", kind: "person", label: "Bob" }],
    facts: [
      { subjectLocalId: "e9", predicate: "role", value: text("CEO") }, // unknown subject
      { subjectLocalId: "e1", predicate: "knows", value: { kind: "entity", entityLocalId: "e9" } }, // unknown object
      { subjectLocalId: "e1", predicate: "knows", value: { kind: "entity", entityLocalId: "e1" } }, // self edge
      { subjectLocalId: "e1", predicate: "role", value: text("CTO") },
    ],
  };
  const { extraction, stats } = reconcileExtraction(x, DEFAULT_KINDS);
  assert.equal(extraction.facts.length, 1);
  assert.equal(extraction.facts[0].value.kind === "text" && extraction.facts[0].value.text, "CTO");
  assert.equal(stats.droppedUnknownRef, 2);
  assert.equal(stats.droppedSelfRef, 1);
});

test("reconcile: entities dedupe by localId (first wins) and unusable labels drop", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "person", label: "  Bob  " },
      { localId: "e1", kind: "company", label: "Bob Inc" }, // duplicate localId
      { localId: "e2", kind: "person", label: "   " }, // blank label
    ],
    facts: [{ subjectLocalId: "e2", predicate: "role", value: text("CEO") }],
  };
  const { extraction } = reconcileExtraction(x);
  assert.equal(extraction.entities.length, 1);
  assert.equal(extraction.entities[0].label, "Bob");
  assert.equal(extraction.entities[0].kind, "person");
  assert.equal(extraction.facts.length, 0); // e2 dropped → its fact drops too
});

test("parseLooseNumber: whole-string numbers only — never digs digits out of prose", () => {
  assert.equal(parseLooseNumber("$1,234.56"), 1234.56);
  assert.equal(parseLooseNumber("1 200 EUR"), 1200);
  assert.equal(parseLooseNumber("42%"), 42);
  assert.equal(parseLooseNumber("-17.5"), -17.5);
  assert.equal(parseLooseNumber("about 100 or so"), null);
  assert.equal(parseLooseNumber("between 100 and 200"), null);
  assert.equal(parseLooseNumber("n/a"), null);
});

test("parseLooseDate: needs an explicit year; vague phrases stay out", () => {
  assert.equal(parseLooseDate("2026-01-02"), "2026-01-02");
  assert.equal(parseLooseDate("March 3, 2026"), "2026-03-03");
  assert.equal(parseLooseDate("next Tuesday"), null);
  assert.equal(parseLooseDate("soon"), null);
});
