// Unit tests for the ego-graph projection (lib/datamodo/explorer.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEgoGraph, radialLayout, depthLayout, DEPTH } from "../lib/datamodo/explorer.ts";
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

test("buildEgoGraph: preferred nodes win ring slots when the caps bite", () => {
  const many = [
    ent("hub", "company", "Hub", [], 99),
    ...Array.from({ length: 6 }, (_, i) =>
      ent(`n${i}`, "person", `P${i}`, [rel("works_for", "hub")], i),
    ),
  ];
  // Without preference n0 (weakest) would be dropped; preferring it keeps it.
  const g = buildEgoGraph(many, "hub", { maxHop1: 3, prefer: new Set(["n0"]) })!;
  const hop1 = g.nodes.filter((n) => n.hop === 1).map((n) => n.id);
  assert.deepEqual(hop1, ["n0", "n5", "n4"], "preferred first, then connectedness");
  assert.equal(g.truncated, 3);
});

test("buildEgoGraph clusterTail: one kind can't hog the ring — the tail folds into a pseudo-node", () => {
  // A company with 30 invoices and 3 people: the ring shows a few invoices,
  // the people, and ONE "+N more invoices" cluster — never 30 spokes.
  const world = [
    ent("co", "company", "Hub Co", [], 33),
    ...Array.from({ length: 30 }, (_, i) =>
      ent(`inv${i}`, "invoice", `INV-${100 + i}`, [rel("issued_by", "co")], 30 - i),
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      ent(`p${i}`, "person", `Person ${i}`, [rel("works_for", "co")], 5),
    ),
  ];
  const g = buildEgoGraph(world, "co", { maxHop1: 6, clusterTail: true, maxPerKind: 3 })!;
  const ring = g.nodes.filter((n) => n.hop === 1);
  const individuals = ring.filter((n) => !n.clusterOf);
  const clusters = ring.filter((n) => n.clusterOf);
  assert.deepEqual(individuals.map((n) => n.id), ["inv0", "inv1", "inv2", "p0", "p1", "p2"]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].label, "+27 more invoices");
  assert.equal(clusters[0].clusterOf!.length, 27);
  assert.equal(clusters[0].clusterOf![0], "inv3", "members importance-ordered");
  assert.equal(g.truncated, 0, "nothing silently dropped — the tail is visible as the cluster");
  // The cluster hangs off the center with the members' majority predicate.
  const ce = g.edges.find((e) => e.from === clusters[0].id)!;
  assert.equal(ce.to, "co");
  assert.equal(ce.predicate, "issued_by");
  assert.equal(g.parentOf[clusters[0].id], "co");
  // Clustered members never leak back in as hop-2 nodes.
  assert.ok(!g.nodes.some((n) => n.hop === 2 && n.id.startsWith("inv")));
});

test("buildEgoGraph clusterTail: preferred (cited) nodes are never folded away", () => {
  const world = [
    ent("co", "company", "Hub Co", [], 33),
    ...Array.from({ length: 10 }, (_, i) =>
      ent(`inv${i}`, "invoice", `INV-${100 + i}`, [rel("issued_by", "co")], 10 - i),
    ),
  ];
  const g = buildEgoGraph(world, "co", { maxHop1: 4, clusterTail: true, maxPerKind: 2, prefer: new Set(["inv9"]) })!;
  const individuals = g.nodes.filter((n) => n.hop === 1 && !n.clusterOf).map((n) => n.id);
  assert.ok(individuals.includes("inv9"), "the weakest invoice stays visible because it was cited");
  const cluster = g.nodes.find((n) => n.clusterOf)!;
  assert.ok(!cluster.clusterOf!.includes("inv9"));
});

test("buildEgoGraph clusterTail: a lone straggler takes a free slot instead of a +1 chip", () => {
  const world = [
    ent("co", "company", "Hub Co", [], 5),
    ...Array.from({ length: 4 }, (_, i) =>
      ent(`inv${i}`, "invoice", `INV-${i}`, [rel("issued_by", "co")], 4 - i),
    ),
  ];
  // perKind 3 would fold inv3 alone; the ring has room, so it stays a node.
  const g = buildEgoGraph(world, "co", { maxHop1: 6, clusterTail: true, maxPerKind: 3 })!;
  assert.ok(!g.nodes.some((n) => n.clusterOf));
  assert.equal(g.nodes.filter((n) => n.hop === 1).length, 4);
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

test("buildEgoGraph: parentOf records who introduced each node", () => {
  const g = buildEgoGraph(WORLD, "acme")!;
  assert.equal(g.parentOf["inv1"], "acme");
  assert.equal(g.parentOf["bob"], "acme");
  assert.equal(g.parentOf["po"], "inv1"); // hop-2 belongs to the hop-1 that pulled it in
  assert.equal(g.parentOf["acme"], undefined); // the center has no introducer
});

test("depthLayout: center forward, rings at their planes, hop-2 near its parent", () => {
  const g = buildEgoGraph(WORLD, "acme")!;
  const pos = depthLayout(g, 800, 600);
  assert.deepEqual({ x: pos["acme"].x, y: pos["acme"].y, z: pos["acme"].z }, { x: 0, y: 0, z: DEPTH.centerZ });
  for (const n of g.nodes.filter((n) => n.hop === 1)) {
    assert.equal(pos[n.id].z, DEPTH.hop1Z);
    assert.equal(pos[n.id].parent, "acme");
  }
  const po = pos["po"];
  assert.equal(po.z, DEPTH.hop2Z);
  assert.equal(po.parent, "inv1");
  // hop-2 sits within the spread of its parent's bearing
  assert.ok(Math.abs(po.angleDeg - pos["inv1"].angleDeg) <= DEPTH.hop2SpreadDeg + 0.001);
  // deterministic
  assert.deepEqual(pos, depthLayout(g, 800, 600));
});

test("depthLayout: reduced motion flattens every z to the plane", () => {
  const g = buildEgoGraph(WORLD, "acme")!;
  const pos = depthLayout(g, 800, 600, true);
  assert.ok(Object.values(pos).every((p) => p.z === 0));
});

test("depthLayout: a sparse ring fans across the upper arc", () => {
  const sparse = [
    ent("hub", "company", "Hub", [], 2),
    ent("a", "person", "A", [rel("knows", "hub")], 1),
    ent("b", "invoice", "B", [rel("billed_to", "hub")], 1),
  ];
  const g = buildEgoGraph(sparse, "hub")!;
  const pos = depthLayout(g, 800, 600);
  const ring = g.nodes.filter((n) => n.hop === 1).map((n) => pos[n.id]);
  assert.equal(ring.length, 2);
  for (const p of ring) assert.ok(p.y < 0, "sparse neighbors sit in the upper arc");
});

// --- Layered ego (the zoom-out) ---------------------------------------------

import { buildLayeredEgo } from "../lib/datamodo/explorer.ts";

const LAYERED_WORLD = [
  ent("acme", "company", "Acme Inc", [], 9),
  ent("inv1", "invoice", "INV-1", [rel("issued_by", "acme")], 2),
  ent("bob", "person", "Bob", [rel("works_for", "acme")], 2),
  ent("po", "document", "PO-9", [rel("references", "inv1")], 1),
  ent("law", "company", "Law LLP", [rel("hired_for", "po")], 1),
  ent("lost", "note", "Loose note"),
];

test("buildLayeredEgo: BFS rings around the center, any depth; unlinked entities form the final ring", () => {
  const g = buildLayeredEgo(LAYERED_WORLD, "acme")!;
  const hopOf = new Map(g.nodes.map((n) => [n.id, n.hop]));
  assert.equal(hopOf.get("acme"), 0);
  assert.equal(hopOf.get("inv1"), 1);
  assert.equal(hopOf.get("bob"), 1);
  assert.equal(hopOf.get("po"), 2);
  assert.equal(hopOf.get("law"), 3, "layers go past the walk's 2 hops");
  const lost = g.nodes.find((n) => n.id === "lost")!;
  assert.equal(lost.hop, 4, "unreachable entities sit one ring past the deepest");
  assert.equal(lost.linked, false);
  assert.equal(g.maxHop, 4);
});

test("buildLayeredEgo: bearings are fixed and deterministic; children stay inside their parent's wedge", () => {
  const a = buildLayeredEgo(LAYERED_WORLD, "acme")!;
  const b = buildLayeredEgo([...LAYERED_WORLD], "acme")!;
  assert.deepEqual(a, b, "same input, same layout — zoom can never re-flow it");
  const angle = new Map(a.nodes.map((n) => [n.id, n.angleDeg]));
  // po descends from inv1: it must sit nearer inv1's bearing than bob's.
  const dist = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180);
  assert.ok(
    dist(angle.get("po")!, angle.get("inv1")!) < dist(angle.get("po")!, angle.get("bob")!),
    "a child keeps its parent's bearing neighbourhood",
  );
  const po = a.nodes.find((n) => n.id === "po")!;
  assert.equal(po.parent, "inv1");
});

test("buildLayeredEgo: per-parent long tails fold into a '+N more' chip with a spoke to the parent", () => {
  const world = [
    ent("hub", "company", "Hub", [], 40),
    ...Array.from({ length: 12 }, (_, i) => ent(`n${i}`, "invoice", `INV-${i}`, [rel("issued_by", "hub")], 12 - i)),
  ];
  const g = buildLayeredEgo(world, "hub", { maxChildren: 7 })!;
  const ring1 = g.nodes.filter((n) => n.hop === 1);
  const chip = ring1.find((n) => n.clusterOf)!;
  assert.equal(ring1.length, 8, "7 kept + 1 chip");
  assert.equal(chip.clusterOf!.length, 5);
  assert.equal(chip.entity.label, "+5 more");
  assert.ok(g.edges.some((e) => e.from === chip.id && e.to === "hub" && e.predicate === ""), "chip hangs off its parent");
  // Folded ids never leak back onto deeper rings.
  assert.ok(!g.nodes.some((n) => n.hop > 1));
});

test("buildLayeredEgo: a lone straggler takes the slot instead of a +1 chip; unknown center → null", () => {
  const world = [
    ent("hub", "company", "Hub", [], 8),
    ...Array.from({ length: 8 }, (_, i) => ent(`n${i}`, "invoice", `INV-${i}`, [rel("issued_by", "hub")], 8 - i)),
  ];
  const g = buildLayeredEgo(world, "hub", { maxChildren: 7 })!;
  assert.ok(!g.nodes.some((n) => n.clusterOf));
  assert.equal(g.nodes.filter((n) => n.hop === 1).length, 8);
  assert.equal(buildLayeredEgo(world, "nope"), null);
});

test("buildLayeredEgo: edges connect only kept real nodes and carry predicates", () => {
  const g = buildLayeredEgo(LAYERED_WORLD, "acme")!;
  const e = g.edges.find((x) => x.from === "po" && x.to === "inv1")!;
  assert.equal(e.predicate, "references");
  const ids = new Set(g.nodes.map((n) => n.id));
  assert.ok(g.edges.every((x) => ids.has(x.from) && ids.has(x.to)));
});
