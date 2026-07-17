// Unit tests for within-extraction reconciliation (lib/datamodo/reconcile-core.ts):
// the deterministic, zero-LLM pass that keeps "author: xxx, author: yyy" from
// collapsing into a last-one-wins supersession chain. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalDateValue,
  canonicalizeNaturalKeys,
  declaredCardinality,
  enrichSenderIdentity,
  foldConceptKey,
  foldPluralWord,
  groundExtractionEvidence,
  normalizePhone,
  normalizeUnit,
  normalizeUrl,
  parseLooseDate,
  parseLooseNumber,
  parseSender,
  reconcileExtraction,
  UNGROUNDED_CONFIDENCE_CAP,
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

test("natural keys canonicalize: same phone/email/url → same tier-0 key", () => {
  assert.equal(normalizePhone("+1 (555) 123-4567"), "+15551234567");
  assert.equal(normalizePhone("555.123.4567"), "5551234567");
  assert.equal(normalizePhone("ext. 12"), "ext. 12"); // not a phone — untouched
  assert.deepEqual(canonicalizeNaturalKeys({ email: " Bob@Acme.COM ", phone: "555-123-4567", invoice_no: " INV-9 " }), {
    email: "bob@acme.com",
    phone: "5551234567",
    invoice_no: "INV-9",
  });
  assert.deepEqual(canonicalizeNaturalKeys({ email: "   " }), {}); // blanks drop
});

test("normalizeUrl: tracking params and trailing slash go, page identity stays", () => {
  assert.equal(
    normalizeUrl("https://Example.com/post/?utm_source=x&utm_campaign=y&fbclid=abc"),
    "https://example.com/post",
  );
  assert.equal(normalizeUrl("https://example.com/a?id=7&utm_medium=m"), "https://example.com/a?id=7");
  assert.equal(normalizeUrl("not a url"), "not a url");
});

test("date values canonicalize: unpadded pads, prose rescues, garbage drops the fact", () => {
  assert.equal(canonicalDateValue("2026-1-2"), "2026-01-02");
  assert.equal(canonicalDateValue("2026-01-02"), "2026-01-02");
  assert.equal(canonicalDateValue("March 3, 2026"), "2026-03-03");
  assert.equal(canonicalDateValue("someday"), null);

  const { extraction, stats } = reconcileExtraction({
    entities: [{ localId: "e1", kind: "event", label: "Offsite" }],
    facts: [
      { subjectLocalId: "e1", predicate: "date", value: { kind: "date", date: "2026-1-2" } },
      { subjectLocalId: "e1", predicate: "location", value: text("   ") }, // blank → drops
    ],
  });
  assert.equal(extraction.facts.length, 1);
  assert.equal(extraction.facts[0].value.kind === "date" && extraction.facts[0].value.date, "2026-01-02");
  assert.equal(stats.droppedEmpty, 1);
});

test("evidence grounding: missing snippet quote or absent number caps confidence; presence never penalizes", () => {
  const source = "Invoice INV-9 from Acme for $1,234.56 due next month. Contact bob@acme.com.";
  const x: Extraction = {
    entities: [{ localId: "e1", kind: "invoice", label: "INV-9" }],
    facts: [
      // grounded: number appears (separators ignored), snippet is a real quote
      { subjectLocalId: "e1", predicate: "amount", value: { kind: "number", num: 1234.56 }, confidence: 0.95, snippet: "for $1,234.56 due" },
      // ungrounded: number nowhere in the text
      { subjectLocalId: "e1", predicate: "tax", value: { kind: "number", num: 999 }, confidence: 0.9 },
      // ungrounded: fabricated "quote"
      { subjectLocalId: "e1", predicate: "status", value: text("paid"), confidence: 0.9, snippet: "payment was received in full" },
      // no snippet + text value → never penalized
      { subjectLocalId: "e1", predicate: "period", value: text("January"), confidence: 0.8 },
    ],
  };
  const { extraction, ungrounded } = groundExtractionEvidence(x, source);
  assert.equal(ungrounded, 2);
  assert.equal(extraction.facts[0].confidence, 0.95);
  assert.equal(extraction.facts[1].confidence, UNGROUNDED_CONFIDENCE_CAP);
  assert.equal(extraction.facts[2].confidence, UNGROUNDED_CONFIDENCE_CAP);
  assert.equal(extraction.facts[3].confidence, 0.8);
});

test("parseLooseDate: needs an explicit year; vague phrases stay out", () => {
  assert.equal(parseLooseDate("2026-01-02"), "2026-01-02");
  assert.equal(parseLooseDate("March 3, 2026"), "2026-03-03");
  assert.equal(parseLooseDate("next Tuesday"), null);
  assert.equal(parseLooseDate("soon"), null);
});

test("normalizeUnit: currency spellings collapse so $100 and 100 USD share a slot", () => {
  assert.equal(normalizeUnit("$"), "USD");
  assert.equal(normalizeUnit("dollars"), "USD");
  assert.equal(normalizeUnit("usd "), "USD");
  assert.equal(normalizeUnit("€"), "EUR");
  assert.equal(normalizeUnit("eur"), "EUR");
  assert.equal(normalizeUnit("chf"), "CHF"); // bare 3-letter code uppercases
  assert.equal(normalizeUnit("kg"), "kg");
  assert.equal(normalizeUnit("bytes"), "bytes");

  const { extraction } = reconcileExtraction({
    entities: [{ localId: "e1", kind: "invoice", label: "INV-9" }],
    facts: [{ subjectLocalId: "e1", predicate: "amount", value: { kind: "number", num: 100, unit: "$" } }],
  });
  assert.equal(extraction.facts[0].value.kind === "number" && extraction.facts[0].value.unit, "USD");
});

test("plural folding: concepts collapse singular/plural, tricky endings survive", () => {
  assert.equal(foldPluralWord("strategies"), "strategy");
  assert.equal(foldPluralWord("boxes"), "box");
  assert.equal(foldPluralWord("notes"), "note");
  assert.equal(foldPluralWord("invoices"), "invoice");
  assert.equal(foldPluralWord("analysis"), "analysis");
  assert.equal(foldPluralWord("glass"), "glass");
  assert.equal(foldPluralWord("campus"), "campus");
  assert.equal(foldConceptKey("marketing strategies"), "marketing strategy");
  assert.equal(foldConceptKey("machine learning"), "machine learning");
});

test("parseSender: display-name + email forms, bare email, plain name", () => {
  assert.deepEqual(parseSender("Bob Smith <Bob@Acme.com>"), { name: "Bob Smith", email: "bob@acme.com" });
  assert.deepEqual(parseSender('"Smith, Bob" <bob@acme.com>'), { name: "Smith, Bob", email: "bob@acme.com" });
  assert.deepEqual(parseSender("bob@acme.com"), { name: null, email: "bob@acme.com" });
  assert.deepEqual(parseSender("whatsapp:+15551234567"), { name: "whatsapp:+15551234567", email: null });
});

test("enrichSenderIdentity: the sender's person entity inherits the envelope email — conservatively", () => {
  const x: Extraction = {
    entities: [
      { localId: "e1", kind: "person", label: "Bob Smith" },
      { localId: "e2", kind: "company", label: "Acme" },
    ],
    facts: [],
  };
  const enriched = enrichSenderIdentity(x, "Bob Smith <bob@acme.com>");
  assert.equal(enriched.entities[0].naturalKeys?.email, "bob@acme.com");
  assert.equal(enriched.entities[1].naturalKeys?.email, undefined);

  // name mismatch → untouched
  assert.equal(enrichSenderIdentity(x, "Alice Jones <alice@x.com>").entities[0].naturalKeys?.email, undefined);
  // existing email is never overwritten
  const hasEmail: Extraction = {
    entities: [{ localId: "e1", kind: "person", label: "Bob Smith", naturalKeys: { email: "bob@personal.io" } }],
    facts: [],
  };
  assert.equal(enrichSenderIdentity(hasEmail, "Bob Smith <bob@acme.com>").entities[0].naturalKeys?.email, "bob@personal.io");
  // bare email (no display name) → no guess
  assert.equal(enrichSenderIdentity(x, "bob@acme.com").entities[0].naturalKeys?.email, undefined);
  // another entity already carries that email → no duplicate key
  const dup: Extraction = {
    entities: [
      { localId: "e1", kind: "person", label: "Bob Smith" },
      { localId: "e2", kind: "person", label: "Robert Smith", naturalKeys: { email: "bob@acme.com" } },
    ],
    facts: [],
  };
  assert.equal(enrichSenderIdentity(dup, "Bob Smith <bob@acme.com>").entities[0].naturalKeys?.email, undefined);
});
