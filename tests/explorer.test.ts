// Unit tests for the ego-graph projection (lib/datamodo/explorer.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEgoGraph, radialLayout } from "../lib/datamodo/explorer.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const rel = (predicate: string, refId: string, over: Partial<KnowledgeFactView> = {}): KnowledgeFactView => ({
  predicate, value: "?", ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: "2026-07-01T00:00:00.000Z", ...over,
});

const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], edges = 0): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges, bodyMd: null, graphPin: null,
});

// acme ← issued_by ← inv1, inv2 ; acme —works_for— bob ; inv1 → po (hop 2 from acme)
const WORLD = [
  ent("acme", "company", "Acme Inc", [], 4),
  ent("inv1", "invoice", "INV-1", [rel("issued_by", "acme"), rel("references", "po")], 3),
  ent("inv2", "invoice", "INV-2", [rel("issued_by", "acme")], 1),
  ent("bob", "person", "Bob", [rel("works_for", "acme")], 1),
  ent("po", "document", "PO-9", [], 1),
];

test("buildEgoGraph: hops assigned by BFS; edges carry their fact + direction", () => {
  const g = buildEgoGraph(WORLD, "acme")!;
  assert.equal(g.center.id, "acme");
  const hopOf = new Map(g.nodes.map((n) => [n.id, n.hop]));
  assert.equal(hopOf.get("inv1"), 1);
  assert.equal(hopOf.get("bob"), 1);
  assert.equal(hopOf.get("po"), 2, "po is 2 hops out via inv1");

  const e = g.edges.find((x) => x.from === "inv1" && x.to === "acme")!;
  assert.equal(e.predicate, "issued_by");
  assert.equal(e.fact.confidence, 0.9, "the edge exposes its fact's metadata");
  assert.equal(e.fromLabel, "INV-1");
  assert.equal(e.toLabel, "Acme Inc");
  assert.equal(g.truncated, 0);
});

test("buildEgoGraph: ring caps keep the most-connected neighbors and count drops", () => {
  const many = [
    ent("hub", "company", "Hub", [], 99),
    ...Array.from({ length: 6 }, (_, i) =>
      ent(`n${i}`, "person", `P${i}`, [rel("works_for", "hub")], i), // edges = i → ranks
    ),
  ];
  const g = buildEgoGraph(many, "hub", { maxHop1: 3 })!;
  const hop1 = g.nodes.filter((n) => n.hop === 1).map((n) => n.id);
  assert.deepEqual(hop1, ["n5", "n4", "n3"], "highest-edge-count neighbors kept, deterministic");
  assert.equal(g.truncated, 3);
});

test("buildEgoGraph: unknown center → null; edges only among included nodes", () => {
  assert.equal(buildEgoGraph(WORLD, "nope"), null);
  const g = buildEgoGraph(WORLD, "bob")!; // po is 3 hops from bob → excluded
  assert.ok(!g.nodes.some((n) => n.id === "po"));
  assert.ok(!g.edges.some((e) => e.from === "inv1" && e.to === "po"));
});

test("radialLayout: deterministic rings — center mid, hop2 in its parent's sector", () => {
  const g = buildEgoGraph(WORLD, "acme")!;
  const a = radialLayout(g, 900, 600);
  const b = radialLayout(g, 900, 600);
  assert.deepEqual(a, b, "no randomness");
  assert.deepEqual(a["acme"], { x: 450, y: 300 });
  const dist = (id: string) => Math.hypot(a[id].x - 450, (a[id].y - 300) / 0.82);
  assert.ok(dist("inv1") < dist("po"), "hop2 sits on the outer ring");
  // po fans out near inv1's angle, not across the canvas from it.
  const angle = (id: string) => Math.atan2((a[id].y - 300) / 0.82, a[id].x - 450);
  assert.ok(Math.abs(angle("po") - angle("inv1")) < 0.6);
});
