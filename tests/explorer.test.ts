// Unit tests for the ego-graph projection (lib/datamodo/explorer.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEgoGraph, radialLayout, depthLayout, pluralizeKind, DEPTH } from "../lib/datamodo/explorer.ts";
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

/* ---- Ring grouping: the capped long tail collapses per kind ------------- */

// hub with 5 invoices (rank 10..14) + 3 people (rank 1..3); hop-1 cap 3 →
// top 3 invoices kept, the tail groups into "+2 more invoices" + "+3 more people".
const CROWD = [
  ent("hub", "company", "Hub", [], 99),
  ...Array.from({ length: 5 }, (_, i) =>
    ent(`inv${i}`, "invoice", `INV-${i}`, [rel("issued_by", "hub")], 10 + i),
  ),
  ...Array.from({ length: 3 }, (_, i) =>
    ent(`p${i}`, "person", `P${i}`, [rel("works_for", "hub")], 1 + i),
  ),
];

test("buildEgoGraph: ring overflow groups per kind, biggest first, rank-ordered members", () => {
  const g = buildEgoGraph(CROWD, "hub", { maxHop1: 3 })!;
  assert.deepEqual(g.nodes.filter((n) => n.hop === 1).map((n) => n.id), ["inv4", "inv3", "inv2"]);
  assert.equal(g.truncated, 5, "every dropped neighbour is still counted");
  assert.equal(g.groups.length, 2);
  const [people, invoices] = g.groups;
  assert.deepEqual(
    { id: people.id, hop: people.hop, count: people.count, label: people.label, parentId: people.parentId },
    { id: "group:1:person", hop: 1, count: 3, label: "+3 more people", parentId: "hub" },
  );
  assert.deepEqual(people.memberIds, ["p2", "p1", "p0"], "members keep ring rank order");
  assert.deepEqual(
    { id: invoices.id, count: invoices.count, label: invoices.label },
    { id: "group:1:invoice", count: 2, label: "+2 more invoices" },
  );
  assert.deepEqual(invoices.memberIds, ["inv1", "inv0"]);
});

test("buildEgoGraph: no overflow → no groups; a lone drop reads singular", () => {
  assert.deepEqual(buildEgoGraph(WORLD, "acme")!.groups, []);
  const g = buildEgoGraph(CROWD, "hub", { maxHop1: 7 })!;
  assert.deepEqual(g.groups.map((x) => x.label), ["+1 more person"]);
});

test("buildEgoGraph: pinned ids join the ring past the cap and leave their group", () => {
  const g = buildEgoGraph(CROWD, "hub", { maxHop1: 3, pinned: ["p2", "p1"] })!;
  const hop1 = g.nodes.filter((n) => n.hop === 1).map((n) => n.id);
  assert.deepEqual(hop1, ["inv4", "inv3", "inv2", "p2", "p1"], "cap counts only unpinned; rank order holds");
  const people = g.groups.find((x) => x.kind === "person")!;
  assert.deepEqual(people.memberIds, ["p0"], "revealed members left the group");
  assert.equal(g.truncated, 3);
});

test("buildEgoGraph: a hop-2 group anchors to the hop-1 node that introduced most members", () => {
  const world = [
    ent("hub", "company", "Hub", [], 9),
    ent("a", "person", "A", [rel("works_for", "hub")], 8),
    ent("b", "person", "B", [rel("works_for", "hub")], 7),
    // 3 docs behind b, 1 behind a; hop-2 cap 1 keeps the top one.
    ent("d0", "document", "D0", [rel("about", "b")], 5),
    ent("d1", "document", "D1", [rel("about", "b")], 4),
    ent("d2", "document", "D2", [rel("about", "b")], 3),
    ent("d3", "document", "D3", [rel("about", "a")], 2),
  ];
  const g = buildEgoGraph(world, "hub", { maxHop1: 6, maxHop2: 1 })!;
  assert.deepEqual(g.nodes.filter((n) => n.hop === 2).map((n) => n.id), ["d0"]);
  const docs = g.groups.find((x) => x.id === "group:2:document")!;
  assert.deepEqual(docs.memberIds, ["d1", "d2", "d3"]);
  assert.equal(docs.parentId, "b", "b introduced 2 of the 3 collapsed docs");
});

test("depthLayout: groups take real ring slots and stay deterministic", () => {
  const g = buildEgoGraph(CROWD, "hub", { maxHop1: 3 })!;
  const pos = depthLayout(g, 800, 600);
  const slots = [...g.nodes.filter((n) => n.hop === 1).map((n) => n.id), ...g.groups.map((x) => x.id)];
  const degs = slots.map((id) => pos[id].angleDeg);
  assert.equal(new Set(degs).size, 5, "3 nodes + 2 groups share one evenly divided ring");
  for (let i = 1; i < degs.length; i++) {
    assert.ok(Math.abs(degs[i] - degs[i - 1] - 360 / 5) < 0.001, "even angular spacing");
  }
  for (const x of g.groups) assert.equal(pos[x.id].z, DEPTH.hop1Z, "hop-1 groups sit on the datum plane");
  assert.deepEqual(pos, depthLayout(g, 800, 600));
});

test("depthLayout: a hop-2 group fans with its anchor's children", () => {
  const world = [
    ent("hub", "company", "Hub", [], 9),
    ent("a", "person", "A", [rel("works_for", "hub")], 8),
    ent("d0", "document", "D0", [rel("about", "a")], 5),
    ent("d1", "document", "D1", [rel("about", "a")], 4),
    ent("d2", "document", "D2", [rel("about", "a")], 3),
  ];
  const g = buildEgoGraph(world, "hub", { maxHop2: 1 })!;
  const pos = depthLayout(g, 800, 600);
  const grp = pos["group:2:document"];
  assert.equal(grp.hop, 2);
  assert.equal(grp.z, DEPTH.hop2Z);
  assert.equal(grp.parent, "a");
  assert.ok(Math.abs(grp.angleDeg - pos["a"].angleDeg) <= DEPTH.hop2SpreadDeg + 0.001);
});

test("pluralizeKind: sensible english for kind slugs", () => {
  assert.equal(pluralizeKind("invoice", 38), "invoices");
  assert.equal(pluralizeKind("company", 2), "companies");
  assert.equal(pluralizeKind("person", 3), "people");
  assert.equal(pluralizeKind("address", 2), "addresses");
  assert.equal(pluralizeKind("invoice", 1), "invoice");
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
