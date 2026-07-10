// Unit tests for the pure concept-map projection (lib/datamodo/concept-map.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConceptMap } from "../lib/datamodo/concept-map.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const fact = (predicate: string, refId: string, value = "?"): KnowledgeFactView => ({
  predicate, value, ref: true, refId, sources: 1, provenance: [], confidence: 1, validFrom: null,
});

const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = []): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: 0, bodyMd: null, graphPin: null,
});

test("buildConceptMap: content files under its concepts, sorted by weight", () => {
  const map = buildConceptMap([
    ent("c1", "concept", "risk parity"),
    ent("c2", "concept", "vendor consolidation"),
    ent("d1", "document", "report.pdf", [fact("about", "c1")]),
    ent("d2", "document", "memo.pdf", [fact("about", "c1")]),
    ent("n1", "note", "braindump", [fact("about", "c2")]),
  ]);
  assert.deepEqual(map.concepts.map((c) => c.label), ["risk parity", "vendor consolidation"]);
  assert.equal(map.concepts[0].items.length, 2);
  assert.deepEqual(map.concepts[1].items.map((i) => i.id), ["n1"]);
  assert.equal(map.links.length, 0, "no shared content, no explicit edge → no links");
});

test("buildConceptMap: co-occurrence links weight by shared content", () => {
  const map = buildConceptMap([
    ent("c1", "concept", "carry"),
    ent("c2", "concept", "momentum"),
    ent("d1", "document", "a.pdf", [fact("about", "c1"), fact("about", "c2")]),
    ent("d2", "document", "b.pdf", [fact("about", "c1"), fact("about", "c2")]),
    ent("d3", "document", "c.pdf", [fact("about", "c1")]),
  ]);
  assert.equal(map.links.length, 1);
  assert.deepEqual(map.links[0], { a: "c1", b: "c2", explicit: false, shared: 2 });
});

test("buildConceptMap: explicit related_to merges with co-occurrence", () => {
  const map = buildConceptMap([
    ent("c1", "concept", "carry", [fact("related_to", "c2")]),
    ent("c2", "concept", "momentum"),
    ent("d1", "document", "a.pdf", [fact("about", "c1"), fact("about", "c2")]),
  ]);
  assert.equal(map.links.length, 1);
  assert.deepEqual(map.links[0], { a: "c1", b: "c2", explicit: true, shared: 1 });
});

test("buildConceptMap: ignores non-concept edges and duplicate about facts", () => {
  const map = buildConceptMap([
    ent("c1", "concept", "carry"),
    ent("acme", "company", "Acme Inc"),
    // mentions → company edge must not leak into the concept map; the double
    // `about` to the same concept counts the document once.
    ent("d1", "document", "a.pdf", [fact("mentions", "acme"), fact("about", "c1"), fact("about", "c1")]),
  ]);
  assert.equal(map.concepts.length, 1);
  assert.equal(map.concepts[0].items.length, 1);
  assert.equal(map.links.length, 0);
});

test("buildConceptMap: empty when there are no concepts", () => {
  const map = buildConceptMap([ent("acme", "company", "Acme Inc")]);
  assert.deepEqual(map, { concepts: [], links: [] });
});
