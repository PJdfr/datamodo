// Unit tests for the ego-graph projection (lib/datamodo/explorer.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEgoGraph, buildLayeredEgo, continuousLayout, projectDepth, DEPTH } from "../lib/datamodo/explorer.ts";
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

test("buildEgoGraph: parentOf records who introduced each node", () => {
  const g = buildEgoGraph(WORLD, "acme")!;
  assert.equal(g.parentOf["inv1"], "acme");
  assert.equal(g.parentOf["bob"], "acme");
  assert.equal(g.parentOf["po"], "inv1"); // hop-2 belongs to the hop-1 that pulled it in
  assert.equal(g.parentOf["acme"], undefined); // the center has no introducer
});

// --- Layered ego (the Explorer's rings) --------------------------------------

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

test("buildLayeredEgo: preferred (cited) nodes rank first among a parent's children and never fold away", () => {
  const world = [
    ent("hub", "company", "Hub", [], 40),
    ...Array.from({ length: 12 }, (_, i) => ent(`n${i}`, "invoice", `INV-${i}`, [rel("issued_by", "hub")], 12 - i)),
  ];
  // n11 is the weakest child — without preference it folds into the chip.
  const plain = buildLayeredEgo(world, "hub", { maxChildren: 7 })!;
  assert.ok(plain.nodes.find((n) => n.clusterOf)!.clusterOf!.includes("n11"));
  const g = buildLayeredEgo(world, "hub", { maxChildren: 7, prefer: new Set(["n11"]) })!;
  const ring1 = g.nodes.filter((n) => n.hop === 1 && !n.clusterOf).map((n) => n.id);
  assert.equal(ring1[0], "n11", "preferred ranks first");
  assert.ok(!g.nodes.find((n) => n.clusterOf)!.clusterOf!.includes("n11"), "cited nodes are never hidden in a chip");
});

test("buildLayeredEgo: a crowded ring spreads over the FULL circle; a sparse one keeps parent locality", () => {
  // Two hubs off the center: one bushy (7 kept kids + chip), one thin (2 kids).
  const world = [
    ent("c", "company", "Center", [], 20),
    ent("busy", "company", "Busy Hub", [rel("partner_of", "c")], 12),
    ent("thin", "company", "Thin Hub", [rel("partner_of", "c")], 3),
    ...Array.from({ length: 10 }, (_, i) => ent(`b${i}`, "invoice", `B-${i}`, [rel("issued_by", "busy")], 1)),
    ent("t0", "person", "T Zero", [rel("works_for", "thin")], 1),
    ent("t1", "person", "T One", [rel("works_for", "thin")], 1),
  ];
  const g = buildLayeredEgo(world, "c", { maxChildren: 7 })!;
  // Ring 2 = 7 busy kids + chip + 2 thin kids = 10 ≥ comfort(2·9=18)? t=0.55 → blended.
  const ring2 = g.nodes.filter((n) => n.hop === 2).map((n) => n.angleDeg).sort((a, b) => a - b);
  assert.ok(ring2.length >= 9);
  // Blended spacing: the largest angular gap on the ring shrinks well below
  // what pure per-parent wedges would leave (thin hub's sector was ~half the
  // circle for 2 nodes). With blending, no gap should exceed ~2.5× uniform.
  const gaps = ring2.map((a, i) => (i === 0 ? a + 360 - ring2[ring2.length - 1] : a - ring2[i - 1]));
  const uniform = 360 / ring2.length;
  assert.ok(Math.max(...gaps) < uniform * 2.5, `max gap ${Math.max(...gaps).toFixed(0)}° vs uniform ${uniform.toFixed(0)}°`);
  // Determinism still holds after the blend.
  assert.deepEqual(g, buildLayeredEgo([...world], "c", { maxChildren: 7 }));
});

// --- Continuous layout (ONE view, walk → whole world) ------------------------

test("continuousLayout: zoom 2 IS the walk — center forward, ring 1 on the datum, frontier back + blurred", () => {
  const g = buildLayeredEgo(LAYERED_WORLD, "acme")!;
  const lay = continuousLayout(g, 2, 900, 620);
  const c = lay.get("acme")!;
  assert.deepEqual({ x: c.x, y: c.y }, { x: 0, y: 0 });
  assert.equal(c.z, DEPTH.centerZ, "the center sits forward");
  assert.equal(c.blur, 0);
  const r1 = lay.get("inv1")!;
  assert.equal(r1.z, 0, "ring 1 rides the datum plane");
  assert.equal(r1.blur, 0);
  assert.equal(r1.op, 1);
  const r2 = lay.get("po")!;
  assert.equal(r2.z, DEPTH.frontierZ, "the frontier ring hangs back");
  assert.equal(r2.blur, 1.4);
  assert.equal(r2.op, 0.9);
  assert.ok(r2.scale < r1.scale, "frontier cards are smaller");
  assert.ok(c.scale >= r1.scale, "the center leads the wheel at walk depth");
  assert.equal(lay.get("law"), undefined, "rings past the frontier are hidden");
  assert.equal(lay.get("lost"), undefined);
  assert.deepEqual(lay, continuousLayout(g, 2, 900, 620), "deterministic");
});

test("continuousLayout: the fraction emerges the next ring from the center — growing, translucent, blurred", () => {
  const g = buildLayeredEgo(LAYERED_WORLD, "acme")!;
  const mid = continuousLayout(g, 2.5, 900, 620);
  const landed = continuousLayout(g, 3, 900, 620);
  const emerging = mid.get("law")!; // hop 3
  const settled = landed.get("law")!;
  const rMid = Math.hypot(emerging.x, emerging.y);
  const rEnd = Math.hypot(settled.x, settled.y);
  assert.ok(rMid > 0 && rMid < rEnd, "travels out from the center toward its ring");
  assert.ok(emerging.op < settled.op, "fades in with the emergence");
  assert.ok(emerging.scale < settled.scale, "grows as it lands");
  assert.ok(emerging.blur > 0, "the emerging ring is the blurred frontier");
  // Rings past the emerging one stay hidden even mid-emergence.
  assert.equal(mid.get("lost"), undefined);
});

test("continuousLayout: continuous across the integer boundary — no jump as a ring lands", () => {
  const g = buildLayeredEgo(LAYERED_WORLD, "acme")!;
  const before = continuousLayout(g, 2.999, 900, 620);
  const after = continuousLayout(g, 3, 900, 620);
  for (const id of ["acme", "inv1", "po", "law"]) {
    const a = before.get(id)!;
    const b = after.get(id)!;
    for (const k of ["x", "y", "z", "scale", "op", "blur"] as const) {
      assert.ok(Math.abs(a[k] - b[k]) < 0.5, `${id}.${k}: ${a[k]} vs ${b[k]}`);
    }
  }
});

test("continuousLayout: depth flattens as you pull out; reduced motion is flat everywhere", () => {
  const g = buildLayeredEgo(LAYERED_WORLD, "acme")!;
  const near = continuousLayout(g, 2, 900, 620).get("acme")!;
  const far = continuousLayout(g, 4, 900, 620).get("acme")!;
  assert.ok(Math.abs(far.z) < Math.abs(near.z), "the depth field settles toward the flat wheel");
  const flat = continuousLayout(g, 2.6, 900, 620, true);
  assert.ok([...flat.values()].every((p) => p.z === 0), "reduced motion flattens every z");
  assert.ok([...flat.values()].every((p) => p.blur === 0), "…and drops the frontier blur");
});

test("projectDepth: identity on the flat plane; z moves points along rays from the perspective origin", () => {
  assert.deepEqual(projectDepth(50, 40, 0, 800, 600), { x: 450, y: 340 });
  const fwd = projectDepth(50, 40, DEPTH.centerZ, 800, 600);
  assert.ok(fwd.x > 450, "closer cards spread outward");
  const back = projectDepth(50, 40, DEPTH.frontierZ, 800, 600);
  assert.ok(back.x < 450 && back.x > 400, "distant cards squeeze toward the origin");
  // Dead center of the projection is a fixed point at any depth.
  const pin = projectDepth(0, 600 * DEPTH.originY - 300, 120, 800, 600);
  assert.ok(Math.abs(pin.x - 400) < 0.001 && Math.abs(pin.y - 600 * DEPTH.originY) < 0.001);
});
