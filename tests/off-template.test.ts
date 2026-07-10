// Unit tests for off-template review routing (lib/datamodo/ontology.ts):
// restrictExtractionToTemplates now RETURNS the template drops, and
// buildOffTemplateReview packages them as a self-contained, replayable review.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KINDS,
  buildOffTemplateReview,
  restrictExtractionToTemplates,
} from "../lib/datamodo/ontology.ts";
import type { Extraction, ExtractedFact } from "../lib/datamodo/knowledge.ts";

const text = (t: string): ExtractedFact["value"] => ({ kind: "text", text: t });

const EXTRACTION: Extraction = {
  entities: [
    { localId: "inv", kind: "invoice", label: "INV-9" },
    { localId: "co", kind: "company", label: "Acme Inc" },
    { localId: "c1", kind: "concept", label: "vendor consolidation" },
  ],
  facts: [
    // On-template invoice facts:
    { subjectLocalId: "inv", predicate: "amount", value: { kind: "number", num: 1200, unit: "EUR" } },
    { subjectLocalId: "inv", predicate: "issued_by", value: { kind: "entity", entityLocalId: "co" } },
    // Off-template on a templated kind → dropped AND captured:
    { subjectLocalId: "inv", predicate: "purchase_order_color", value: text("blue") },
    { subjectLocalId: "inv", predicate: "warehouse_dock", value: { kind: "entity", entityLocalId: "co" } },
    // Concept edge (on-template via `related_to`? no — concepts allow related_to;
    // `flavor` is off-template on the concept kind):
    { subjectLocalId: "c1", predicate: "flavor", value: text("strategic") },
  ],
};

test("restraint captures predicate drops in offTemplate, not concept-policy drops", () => {
  const r = restrictExtractionToTemplates(EXTRACTION, DEFAULT_KINDS, { maxConcepts: 3 });
  const preds = r.offTemplate.map((f) => f.predicate).sort();
  assert.deepEqual(preds, ["flavor", "purchase_order_color", "warehouse_dock"]);
  // The kept extraction has only the template facts.
  assert.deepEqual(r.extraction.facts.map((f) => f.predicate).sort(), ["amount", "issued_by"]);
});

test("concept-leash drops are policy, never routed to review", () => {
  const many: Extraction = {
    entities: [
      { localId: "d", kind: "document", label: "a.pdf" },
      { localId: "c1", kind: "concept", label: "alpha" },
      { localId: "c2", kind: "concept", label: "beta" },
    ],
    facts: [
      { subjectLocalId: "d", predicate: "about", value: { kind: "entity", entityLocalId: "c1" } },
      { subjectLocalId: "d", predicate: "about", value: { kind: "entity", entityLocalId: "c2" } },
    ],
  };
  const r = restrictExtractionToTemplates(many, DEFAULT_KINDS, { maxConcepts: 1 });
  // c2 dropped by the concept cap → its `about` fact drops silently, NOT into
  // offTemplate (it isn't a vocabulary question, it's the leash).
  assert.equal(r.offTemplate.length, 0);
  assert.equal(r.extraction.facts.length, 1);
});

test("buildOffTemplateReview: self-contained replayable payload + display lines", () => {
  const r = restrictExtractionToTemplates(EXTRACTION, DEFAULT_KINDS, { maxConcepts: 3 });
  const payload = buildOffTemplateReview(EXTRACTION, r.offTemplate)!;
  assert.ok(payload);
  // The mini extraction carries exactly the entities its facts touch.
  assert.deepEqual(payload.extraction.entities.map((e) => e.localId).sort(), ["c1", "co", "inv"]);
  assert.equal(payload.extraction.facts.length, 3);
  // Display lines are pre-rendered (subject label + value string + ref flag).
  const dock = payload.display.find((d) => d.predicate === "warehouse_dock")!;
  assert.deepEqual(dock, { subject: "INV-9", subjectKind: "invoice", predicate: "warehouse_dock", value: "Acme Inc", ref: true });
  const color = payload.display.find((d) => d.predicate === "purchase_order_color")!;
  assert.equal(color.value, "blue");
  assert.equal(color.ref, false);
});

test("buildOffTemplateReview: null when nothing dropped or nothing survives", () => {
  assert.equal(buildOffTemplateReview(EXTRACTION, []), null);
  // A fact whose subject vanished from the original can't be replayed.
  const orphan: ExtractedFact[] = [{ subjectLocalId: "ghost", predicate: "x", value: text("y") }];
  assert.equal(buildOffTemplateReview(EXTRACTION, orphan), null);
});
