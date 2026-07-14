// Unit tests for the whole-vault projection (lib/datamodo/vault-graph.ts) —
// the Graph tab's data: every entity a node, every relationship fact an edge.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVaultGraph } from "../lib/datamodo/vault-graph.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const rel = (predicate: string, refId: string): KnowledgeFactView => ({
  predicate, value: "?", ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});

const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = []): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: 0, bodyMd: null, graphPin: null,
});

// acme ← issued_by ← inv1 ; acme ← works_for ← bob ; bob → wrote → inv1 ;
// inv1 → billed_to → bob (two facts on the bob~inv1 pair) ; note floats free.
const WORLD = [
  ent("acme", "company", "Acme Inc"),
  ent("inv1", "invoice", "INV-1", [rel("issued_by", "acme"), rel("billed_to", "bob")]),
  ent("bob", "person", "Bob", [rel("works_for", "acme"), rel("wrote", "inv1")]),
  ent("note", "note", "Loose note"),
];

test("buildVaultGraph: every entity is a node — isolated ones included", () => {
  const g = buildVaultGraph(WORLD);
  assert.equal(g.nodes.length, 4, "the whole vault means the whole vault");
  const note = g.nodes.find((n) => n.id === "note")!;
  assert.equal(note.degree, 0);
  // Degree counts distinct neighbors, not facts: bob touches acme + inv1.
  assert.equal(g.nodes.find((n) => n.id === "bob")!.degree, 2);
});

test("buildVaultGraph: one edge per pair; all facts between the pair ride it", () => {
  const g = buildVaultGraph(WORLD);
  assert.equal(g.edges.length, 3, "acme~inv1, acme~bob, bob~inv1");
  const pair = g.edges.find((e) => e.a === "bob" && e.b === "inv1")!;
  assert.equal(pair.weight, 2, "billed_to + wrote share the pair");
  assert.deepEqual(
    pair.facts.map((f) => `${f.from} ${f.predicate} ${f.to}`).sort(),
    ["bob wrote inv1", "inv1 billed_to bob"],
    "each fact keeps its own direction",
  );
});

test("buildVaultGraph: duplicate facts and dangling/self refs are dropped", () => {
  const world = [
    ent("a", "person", "A", [rel("knows", "b"), rel("knows", "b"), rel("knows", "a"), rel("knows", "ghost")]),
    ent("b", "person", "B"),
  ];
  const g = buildVaultGraph(world);
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].weight, 1, "same (subject, object, predicate) counted once");
});

test("buildVaultGraph: deterministic — same vault in, same arrays out", () => {
  const one = buildVaultGraph(WORLD);
  const two = buildVaultGraph([...WORLD].reverse());
  assert.deepEqual(one.nodes, two.nodes, "node order survives input shuffles");
  assert.deepEqual(one.edges, two.edges, "edge order survives input shuffles");
  // acme and bob tie at degree 2 — the label breaks it ("Acme Inc" < "Bob").
  assert.equal(one.nodes[0].id, "acme", "degree desc, label breaks ties");
});
