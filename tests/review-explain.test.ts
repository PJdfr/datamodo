// Unit tests for the plain-language review explanations
// (lib/datamodo/review-explain.ts). Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { explainReview } from "../lib/datamodo/review-explain.ts";
import type { ReviewItem } from "../lib/datamodo/review-types.ts";

const base = { id: "r1", confidence: 0.62, impact: 4, createdAt: "2026-07-20T00:00:00.000Z" };

test("entity_merge: question names both sides; source carries the resolver's reason", () => {
  const ex = explainReview({
    ...base, kind: "entity_merge",
    parsed: { label: "Acme Incorporated", type: "company", attrs: [], source: "an email" },
    canonical: { label: "Acme Inc", type: "company", attrs: [] },
    reason: "same billing email",
  } as ReviewItem);
  assert.match(ex.question, /Acme Incorporated.*Acme Inc.*same company\?/);
  assert.equal(ex.source.quote, "same billing email");
  assert.match(ex.source.label, /just arrived via an email/);
  assert.match(ex.accept, /ONE company.*Acme Inc.*nothing is lost/i);
  assert.match(ex.refuse, /never ask about this pair again/);
});

test("fact_conflict: applied vs HELD read differently (accept confirms vs switches)", () => {
  const applied = explainReview({
    ...base, kind: "fact_conflict",
    subject: "INV-4417", field: "amount", was: "$18,500", now: "$17,650",
    wasSource: "the July 12 email", nowSource: "the July 18 email", note: "",
  } as ReviewItem);
  assert.match(applied.accept, /already applied/);
  assert.match(applied.refuse, /Goes back to "\$18,500"/);
  assert.match(applied.source.label, /July 18 email says "\$17,650".*July 12 email said "\$18,500"/);

  const held = explainReview({
    ...base, kind: "fact_conflict", held: true,
    subject: "INV-4417", field: "amount", was: "$18,500", now: "$17,650",
    wasSource: "", nowSource: "", note: "",
  } as ReviewItem);
  assert.match(held.source.label, /nothing changed yet/);
  assert.match(held.accept, /becomes "\$17,650"/);
  assert.match(held.refuse, /"\$18,500" stays/);
});

test("extraction: source is the message with its snippet; refuse keeps corroborated facts", () => {
  const ex = explainReview({
    ...base, kind: "extraction",
    from: "billing@acme.com", channel: "email", snippet: "Total due: $400",
    entities: [{ label: "Acme Inc", type: "company" }],
    facts: [{ s: "INV-1", p: "total", v: "400", c: 0.6 }],
  } as ReviewItem);
  assert.match(ex.source.label, /Email from billing@acme.com/);
  assert.equal(ex.source.quote, "Total due: $400");
  assert.match(ex.accept, /1 fact.*about Acme Inc/);
  assert.match(ex.refuse, /also known from other messages stays/);
});

test("off_template: states nothing was filed yet", () => {
  const ex = explainReview({
    ...base, kind: "off_template", docLabel: "lease.pdf", docKind: "contract",
    facts: [{ s: "lease", p: "deposit", v: "900", c: 0.8 }, { s: "lease", p: "notice", v: "60d", c: 0.8 }],
  } as ReviewItem);
  assert.match(ex.source.label, /2 details beyond.*Nothing was filed yet/);
  assert.match(ex.accept, /Files the 2 extra facts/);
});

test("category_proposal + orphan_prune: counts and samples in the source line", () => {
  const cat = explainReview({
    ...base, kind: "category_proposal", proposedKind: "trip", label: "Trip", count: 4,
    sampleLabels: ["Lisbon", "Oslo", "Kyoto", "Rome"],
    fields: [{ key: "start", label: "Start", type: "date" }], relations: [],
  } as ReviewItem);
  assert.match(cat.source.label, /4 so far \(Lisbon, Oslo, Kyoto…\)/);
  assert.match(cat.accept, /its own table/);

  const orphan = explainReview({
    ...base, kind: "orphan_prune", count: 2,
    entities: [{ label: "stray a", type: "concept" }, { label: "stray b", type: "concept" }],
  } as ReviewItem);
  assert.match(orphan.accept, /STILL unlinked right now/);
  assert.match(orphan.refuse, /won't flag these again/);
});

test("field_proposal: alias variant reads as 'another name for'", () => {
  const alias = explainReview({
    ...base, kind: "field_proposal", targetKind: "invoice", predicate: "payment_terms",
    count: 3, valueType: "text", asRelation: false, aliasOf: "terms",
  } as ReviewItem);
  assert.match(alias.question, /another name for "terms"\?/);
  assert.match(alias.accept, /files into the "terms" column/);

  const add = explainReview({
    ...base, kind: "field_proposal", targetKind: "invoice", predicate: "payment_terms",
    count: 3, valueType: "text", asRelation: false,
  } as ReviewItem);
  assert.match(add.question, /Add "payment terms" to every invoice\?/);
  assert.match(add.accept, /"payment terms" column/);
});
