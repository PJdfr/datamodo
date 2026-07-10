// Unit tests for the classify-first, template-restrained document mode
// (pure parts in lib/datamodo/ontology.ts). Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASSIFY_EXCERPT_CHARS,
  DEFAULT_KINDS,
  buildClassifyPrompt,
  buildDocumentPrompt,
  promptCategoryMenu,
  promptKindTemplate,
  restrictExtractionToTemplates,
} from "../lib/datamodo/ontology.ts";
import type { Extraction } from "../lib/datamodo/knowledge.ts";

const invoice = DEFAULT_KINDS.find((k) => k.kind === "invoice")!;

// --- restraint filter ---------------------------------------------------------

test("restrict: off-template facts on a templated kind drop; template facts survive", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "invoice", label: "INV-9" },
      { localId: "e2", kind: "company", label: "Acme" },
    ],
    facts: [
      { subjectLocalId: "e1", predicate: "amount", value: { kind: "number", num: 100, unit: "USD" } },
      { subjectLocalId: "e1", predicate: "issued_by", value: { kind: "entity", entityLocalId: "e2" } },
      // Off the invoice template → noise, drops.
      { subjectLocalId: "e1", predicate: "font_used", value: { kind: "text", text: "Helvetica" } },
    ],
  };
  const r = restrictExtractionToTemplates(x, DEFAULT_KINDS);
  assert.deepEqual(r.extraction.facts.map((f) => f.predicate).sort(), ["amount", "issued_by"]);
  assert.equal(r.droppedFacts, 1);
});

test("restrict: kinds without a template pass through untouched (steer, never block)", () => {
  const x: Extraction = {
    entities: [{ localId: "e1", kind: "recipe", label: "Carbonara" }],
    facts: [{ subjectLocalId: "e1", predicate: "cooking_time", value: { kind: "number", num: 20, unit: "min" } }],
  };
  const r = restrictExtractionToTemplates(x, DEFAULT_KINDS);
  assert.equal(r.extraction.facts.length, 1);
  assert.equal(r.droppedFacts, 0);
});

test("restrict: concepts capped at maxConcepts, their facts dropped with them", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "document", label: "paper.pdf" },
      { localId: "c1", kind: "concept", label: "transformers" },
      { localId: "c2", kind: "concept", label: "distillation" },
      { localId: "c3", kind: "concept", label: "oncology" },
      { localId: "c4", kind: "concept", label: "noise topic" },
    ],
    facts: [
      { subjectLocalId: "e1", predicate: "about", cardinality: "many", value: { kind: "entity", entityLocalId: "c1" } },
      { subjectLocalId: "e1", predicate: "about", cardinality: "many", value: { kind: "entity", entityLocalId: "c4" } },
    ],
  };
  const r = restrictExtractionToTemplates(x, DEFAULT_KINDS, { maxConcepts: 3 });
  const kinds = r.extraction.entities.filter((e) => e.kind === "concept").map((e) => e.localId);
  assert.deepEqual(kinds, ["c1", "c2", "c3"]);
  assert.equal(r.extraction.facts.length, 1); // the c4 edge went with it
  assert.equal(r.extraction.facts[0].value.kind === "entity" && r.extraction.facts[0].value.entityLocalId, "c1");
});

test("restrict: incidental entities (no kept facts) drop; the primary subject never does", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "invoice", label: "INV-9" }, // primary, no facts — kept
      { localId: "e2", kind: "person", label: "Random Passerby" }, // untouched — dropped
    ],
    facts: [],
  };
  const r = restrictExtractionToTemplates(x, DEFAULT_KINDS);
  assert.deepEqual(r.extraction.entities.map((e) => e.localId), ["e1"]);
  assert.equal(r.droppedEntities, 1);
});

test("restrict: facts pointing at dropped entities are removed too", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "invoice", label: "INV-9" },
      { localId: "c1", kind: "concept", label: "a" },
      { localId: "c2", kind: "concept", label: "b" },
    ],
    facts: [
      // concept c2 dropped by cap 1 → this relation must not survive dangling
      { subjectLocalId: "c2", predicate: "related_to", value: { kind: "entity", entityLocalId: "c1" } },
    ],
  };
  const r = restrictExtractionToTemplates(x, DEFAULT_KINDS, { maxConcepts: 1 });
  assert.equal(r.extraction.facts.length, 0);
  assert.deepEqual(r.extraction.entities.map((e) => e.localId), ["e1", "c1"]);
});

test("restrict: a concept merely naming a kind drops — no giant 'invoice' hub node", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "document", label: "inv-scan.pdf" },
      { localId: "c1", kind: "concept", label: "Invoices" }, // plural of a kind → fake hub
      { localId: "c2", kind: "concept", label: "bill" }, // alias of a kind → fake hub
      { localId: "c3", kind: "concept", label: "cloud infrastructure" }, // a real topic
    ],
    facts: [
      { subjectLocalId: "e1", predicate: "about", cardinality: "many", value: { kind: "entity", entityLocalId: "c2" } },
      { subjectLocalId: "e1", predicate: "about", cardinality: "many", value: { kind: "entity", entityLocalId: "c3" } },
    ],
  };
  const r = restrictExtractionToTemplates(x, DEFAULT_KINDS);
  const concepts = r.extraction.entities.filter((e) => e.kind === "concept").map((e) => e.label);
  assert.deepEqual(concepts, ["cloud infrastructure"]);
  assert.equal(r.extraction.facts.length, 1);
});

// --- prompt builders -----------------------------------------------------------

test("promptCategoryMenu: one line per kind with its description", () => {
  const menu = promptCategoryMenu(DEFAULT_KINDS);
  assert.match(menu, /- invoice: A bill or invoice/);
  assert.equal(menu.split("\n").length, DEFAULT_KINDS.length);
});

test("promptKindTemplate: names the kind and lists ONLY its vocabulary", () => {
  const t = promptKindTemplate(invoice);
  assert.match(t, /PRIMARY SUBJECT is a invoice/);
  assert.match(t, /amount \(number, USD, required\)/);
  assert.match(t, /issued_by → a company/);
  assert.doesNotMatch(t, /works_for/); // no other kind's vocabulary leaks in
});

test("buildClassifyPrompt: menu + capped excerpt + filename", () => {
  const p = buildClassifyPrompt({ filename: "inv.pdf", text: "x".repeat(5000), kinds: DEFAULT_KINDS });
  assert.match(p, /- invoice:/);
  assert.match(p, /"inv\.pdf"/);
  assert.ok(p.length < 5000 + 1000); // excerpt is capped
  assert.ok(p.includes("x".repeat(CLASSIFY_EXCERPT_CHARS)));
  assert.ok(!p.includes("x".repeat(CLASSIFY_EXCERPT_CHARS + 1)));
});

test("buildDocumentPrompt: classified → focused template; unclassified → full menu", () => {
  const base = { text: "doc text", filename: "inv.pdf", kinds: DEFAULT_KINDS, concepts: ["ai"] };
  const focused = buildDocumentPrompt({ ...base, docKind: "invoice" });
  assert.match(focused, /PRIMARY SUBJECT is a invoice/);
  assert.doesNotMatch(focused, /The user's CATEGORIES/); // not the whole menu
  assert.match(focused, /existing CONCEPTS \(topics\): ai/);
  assert.match(focused, /Filename: inv\.pdf/);

  const generic = buildDocumentPrompt({ ...base, docKind: null });
  assert.match(generic, /The user's CATEGORIES/);
});
