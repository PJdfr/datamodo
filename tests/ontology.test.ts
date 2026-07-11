// Unit tests for the ontology layer's pure core (lib/datamodo/ontology.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KINDS,
  canonicalizeExtraction,
  canonicalKind,
  canonicalPredicate,
  indexKinds,
  promptCategories,
  slugify,
  unregisteredKinds,
} from "../lib/datamodo/ontology.ts";
import type { Extraction } from "../lib/datamodo/knowledge.ts";

const idx = indexKinds(DEFAULT_KINDS);

test("slugify: snake_cases the LLM's spelling", () => {
  assert.equal(slugify("Invoice Amount"), "invoice_amount");
  assert.equal(slugify("  Publication-Year "), "publication_year");
  assert.equal(slugify("état"), "etat");
});

test("canonicalKind: synonyms collapse, canonical passes, unknown stays free-form", () => {
  assert.equal(canonicalKind("org", idx), "company");
  assert.equal(canonicalKind("Organization", idx), "company");
  assert.equal(canonicalKind("company", idx), "company");
  assert.equal(canonicalKind("bill", idx), "invoice");
  assert.equal(canonicalKind("book", idx), "book"); // free-form survives
  assert.equal(canonicalKind("", idx), "thing");
});

test("canonicalPredicate: aliases collapse within the subject's kind only", () => {
  assert.equal(canonicalPredicate("invoice", "invoice_amount", idx), "amount");
  assert.equal(canonicalPredicate("invoice", "Total Amount", idx), "total_amount".replace("total_amount", "amount"));
  assert.equal(canonicalPredicate("person", "affiliation", idx), "works_for");
  // same alias on a different kind passes through untouched
  assert.equal(canonicalPredicate("company", "invoice_amount", idx), "invoice_amount");
  // off-template predicates survive, slugified
  assert.equal(canonicalPredicate("invoice", "Disclaimer!", idx), "disclaimer");
});

test("canonicalizeExtraction: kinds + predicates normalize, nothing dropped", () => {
  const extraction: Extraction = {
    entities: [
      { localId: "e1", kind: "Org", label: "Acme", naturalKeys: {} },
      { localId: "e2", kind: "bill", label: "INV-9", naturalKeys: { invoice_no: "INV-9" } },
    ],
    facts: [
      { subjectLocalId: "e2", predicate: "invoice_amount", cardinality: "one", value: { kind: "number", num: 100, unit: "USD" } },
      { subjectLocalId: "e2", predicate: "issuer", cardinality: "one", value: { kind: "entity", entityLocalId: "e1" } },
      { subjectLocalId: "e1", predicate: "sector", cardinality: "one", value: { kind: "text", text: "Software" } },
      { subjectLocalId: "e1", predicate: "made_up_thing", cardinality: "one", value: { kind: "text", text: "kept" } },
    ],
  };
  const out = canonicalizeExtraction(extraction, DEFAULT_KINDS);
  assert.deepEqual(out.entities.map((e) => e.kind), ["company", "invoice"]);
  assert.deepEqual(out.facts.map((f) => f.predicate), ["amount", "issued_by", "industry", "made_up_thing"]);
  assert.equal(out.facts.length, extraction.facts.length); // steer, never block
});

test("promptCategories: compact menu with fields, types and verbs", () => {
  const text = promptCategories(DEFAULT_KINDS);
  assert.match(text, /- invoice: .*amount\(number USD, required\)/);
  assert.match(text, /issued_by→company/);
  assert.match(text, /- concept: /);
  assert.equal(promptCategories([]), "");
});

// --- unregisteredKinds (growth loop ⑤ trigger) ---------------------------------

test("unregisteredKinds: only genuinely new vocabulary, labels deduped", () => {
  const extraction: Extraction = {
    entities: [
      { localId: "e1", kind: "Org", label: "Acme", naturalKeys: {} },            // alias → registered
      { localId: "e2", kind: "subscription", label: "Figma Org plan", naturalKeys: {} },
      { localId: "e3", kind: "Subscription", label: "figma org plan", naturalKeys: {} }, // dupe label, case-insensitive
      { localId: "e4", kind: "subscription", label: "Notion Team", naturalKeys: {} },
      { localId: "e5", kind: "thing", label: "misc", naturalKeys: {} },          // generic fallback — never proposed
      { localId: "e6", kind: "concept", label: "billing", naturalKeys: {} },     // builtin
    ],
    facts: [],
  };
  const out = unregisteredKinds(extraction, DEFAULT_KINDS);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "subscription");
  assert.deepEqual(out[0].labels, ["Figma Org plan", "Notion Team"]);
});

test("unregisteredKinds: empty registry proposes nothing generic, everything else", () => {
  const extraction: Extraction = {
    entities: [
      { localId: "e1", kind: "shipment", label: "SHP-1", naturalKeys: {} },
      { localId: "e2", kind: "record", label: "row", naturalKeys: {} },
    ],
    facts: [],
  };
  const out = unregisteredKinds(extraction, []);
  assert.deepEqual(out.map((u) => u.kind), ["shipment"]);
});
