// Unit tests for graph-first retrieval (lib/datamodo/graphrag.ts) — query →
// seed entities → fact-graph traversal → answer evidence. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { linkQueryEntities, expandFromSeeds, mergeKnowledgeHits } from "../lib/datamodo/graphrag.ts";
import type { KnowledgeHit } from "../lib/datamodo/search.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

// The route feeds tokenize(q) output — lowercased distinct terms, stop words
// dropped. The fixtures here hand those term arrays over directly.

const rel = (predicate: string, refId: string, value = "?", confidence = 0.9): KnowledgeFactView => ({
  predicate, value, ref: true, refId, sources: 1, provenance: [], confidence, validFrom: null,
});
const attr = (predicate: string, value: string, confidence = 0.9): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 1, provenance: [], confidence, validFrom: null,
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], edges = 0, naturalKeys: Record<string, string> = {}): KnowledgeEntityView => ({
  id, kind, label, naturalKeys, facts, edges, bodyMd: null, graphPin: null,
});

// acme ← issued_by ← inv1(total $4,200) ; acme ← works_for ← elena ;
// elena → wrote → memo ; loose note floats free.
const WORLD: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Group", [attr("industry", "logistics")], 3, { domain: "acme.example" }),
  ent("inv1", "invoice", "INV-901", [rel("issued_by", "acme", "Acme Group"), attr("total", "$4,200")], 1),
  ent("elena", "person", "Elena Voss", [rel("works_for", "acme", "Acme Group"), rel("wrote", "memo", "Q3 memo")], 2),
  ent("memo", "document", "Q3 memo", [], 1),
  ent("note", "note", "Loose note", [], 0),
];

test("linkQueryEntities: the query must NAME the entity — label or natural key", () => {
  // "how much did I invoice Acme?" → terms {invoice, acme}
  assert.deepEqual(linkQueryEntities(WORLD, ["invoice", "acme"]), ["acme"]);
  assert.deepEqual(linkQueryEntities(WORLD, ["mail", "acme.example"]), ["acme"], "natural keys link too");
  // "elena voss" names her fully; "wrote" alone names nobody.
  assert.deepEqual(linkQueryEntities(WORLD, ["elena", "voss", "wrote"]), ["elena"]);
  assert.deepEqual(linkQueryEntities(WORLD, ["anything", "new"]), []);
});

test("expandFromSeeds: seeds first, neighbors by tie strength, seed-facts flagged", () => {
  const g = expandFromSeeds(WORLD, ["acme"]);
  // Both neighbors tie at one seed-fact; elena's higher edge count breaks it.
  assert.deepEqual(g.hits.map((h) => h.id), ["acme", "elena", "inv1"]);
  const inv = g.hits.find((h) => h.id === "inv1")!;
  assert.equal(inv.facts[0].predicate, "issued_by");
  assert.equal(inv.facts[0].matched, true, "the fact touching the seed leads and is flagged");
  assert.ok(inv.facts.some((f) => f.value === "$4,200"), "the neighbor's attributes ride along — aggregation evidence");
  assert.deepEqual([...g.scopeIds].sort(), ["acme", "elena", "inv1"]);
  assert.deepEqual(expandFromSeeds(WORLD, ["ghost"]), { hits: [], scopeIds: [] });
});

test("expandFromSeeds: multi-hop — the neighbor's own edges name hop-2 entities", () => {
  const g = expandFromSeeds(WORLD, ["acme"]);
  const elena = g.hits.find((h) => h.id === "elena")!;
  const wrote = elena.facts.find((f) => f.predicate === "wrote")!;
  assert.equal(wrote.value, "Q3 memo", "hop-2 evidence by label, no extra traversal needed");
  assert.equal(wrote.matched, false, "only seed-touching facts are flagged");
});

test("mergeKnowledgeHits: graph seeds outrank keyword hits; dedupe keeps the stronger", () => {
  const keyword: KnowledgeHit[] = [
    { id: "acme", label: "Acme Group", kind: "company", facts: [], score: 2 },
    { id: "other", label: "Other Co", kind: "company", facts: [], score: 1 },
  ];
  const graph = expandFromSeeds(WORLD, ["acme"]).hits;
  const merged = mergeKnowledgeHits(keyword, graph, 3);
  assert.equal(merged[0].id, "acme");
  assert.equal(merged[0].score, 10, "the graph version (with traversal fact order) replaced the keyword twin");
  assert.equal(merged.length, 3, "capped");
  assert.ok(merged.some((h) => h.id === "elena") || merged.some((h) => h.id === "inv1"), "neighbors join the evidence");
});
