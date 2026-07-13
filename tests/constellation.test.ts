// Unit tests for the constellation semantic-zoom core
// (lib/datamodo/constellation.ts). Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConstellation, visibleCut, cutEdges, nodeSide, LOD,
  type ClusterNode,
} from "../lib/datamodo/constellation.ts";
import { buildAdjacency } from "../lib/datamodo/explorer.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const rel = (predicate: string, refId: string): KnowledgeFactView => ({
  predicate, value: "?", ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});

const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = []): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: 0, bodyMd: null, graphPin: null,
});

// Two hub worlds: acme (5 invoices + 2 people) and bright (4 docs + 1 person),
// one bridge edge, plus two disconnected stragglers.
const WORLD: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Inc"),
  ...Array.from({ length: 5 }, (_, i) => ent(`ainv${i}`, "invoice", `INV-${i}`, [rel("issued_by", "acme")])),
  ent("bob", "person", "Bob", [rel("works_for", "acme")]),
  ent("ana", "person", "Ana", [rel("works_for", "acme")]),
  ent("bright", "company", "Brightwave"),
  ...Array.from({ length: 4 }, (_, i) => ent(`bdoc${i}`, "document", `DOC-${i}`, [rel("sent_by", "bright")])),
  ent("mia", "person", "Mia", [rel("works_for", "bright"), rel("knows", "bob")]),
  ent("lost1", "note", "Loose note"),
  ent("lost2", "note", "Other note"),
];

const memberSet = (n: ClusterNode) => [...n.memberIds].sort();

test("buildAdjacency: ref facts are undirected weighted edges; same rule for walk and constellation", () => {
  const adj = buildAdjacency(WORLD);
  assert.equal(adj.get("acme")?.get("ainv0"), 1);
  assert.equal(adj.get("ainv0")?.get("acme"), 1, "incoming edges counted too");
  assert.equal(adj.get("lost1"), undefined, "no edges → no entry");
  assert.equal(adj.get("mia")?.size, 2);
});

test("buildConstellation: hubs anchor clusters; members partition; disconnected dust gets one bucket", () => {
  const root = buildConstellation(WORLD);
  assert.equal(root.size, WORLD.length);
  // Every entity appears exactly once across the top-level clusters.
  const all = root.children.flatMap((c) => c.memberIds).sort();
  assert.deepEqual(all, WORLD.map((e) => e.id).sort());

  const acme = root.children.find((c) => c.hubId === "acme")!;
  const bright = root.children.find((c) => c.hubId === "bright")!;
  assert.ok(acme && bright, "the two obvious hubs anchor top clusters");
  assert.equal(acme.label, "Acme Inc", "cluster carries its hub's label");
  assert.ok(acme.memberIds.includes("ainv3"));
  assert.equal(acme.memberIds[0], "acme", "hub listed first");
  assert.ok(bright.memberIds.includes("mia"), "mia's strongest tie wins her cluster");

  const other = root.children.find((c) => c.id === "root/other")!;
  assert.deepEqual(memberSet(other), ["lost1", "lost2"], "unreached nodes → the 'other' bucket");
  assert.equal(other.label, "everything else");
});

test("buildConstellation: deterministic — same input, same tree", () => {
  const a = buildConstellation(WORLD);
  const b = buildConstellation([...WORLD]);
  assert.deepEqual(a, b);
});

test("buildConstellation: recursion bottoms out in leaves (hubId === id, children [])", () => {
  const root = buildConstellation(WORLD);
  const leaves: ClusterNode[] = [];
  const walk = (n: ClusterNode) => (n.children.length ? n.children.forEach(walk) : leaves.push(n));
  root.children.forEach(walk);
  for (const l of leaves) {
    assert.equal(l.size, 1);
    assert.equal(l.hubId, l.id);
    assert.deepEqual(l.memberIds, [l.id]);
  }
  assert.equal(leaves.length, WORLD.length, "every entity is exactly one leaf");
});

test("buildConstellation: sparse worlds fall back to group-by-kind", () => {
  // No node reaches degree 2 → no hubs → kind groups.
  const sparse = [
    ent("a", "invoice", "I-1"), ent("b", "invoice", "I-2"), ent("c", "invoice", "I-3"),
    ent("d", "person", "Pat"), ent("e", "person", "Sam"),
    ent("f", "note", "N-1"),
  ];
  const root = buildConstellation(sparse, { leafMax: 2 });
  const kinds = root.children.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["invoice", "note", "person"]);
  assert.equal(root.children.find((c) => c.kind === "note")!.size, 1, "singleton kind stays a leaf");
  assert.equal(root.children.find((c) => c.kind === "invoice")!.id, "root/kind:invoice");
});

test("buildConstellation: one-kind sparse set becomes leaves, never an identical wrapper", () => {
  const flat = Array.from({ length: 6 }, (_, i) => ent(`n${i}`, "note", `Note ${i}`));
  const root = buildConstellation(flat);
  assert.equal(root.children.length, 6);
  assert.ok(root.children.every((c) => c.children.length === 0));
});

test("nodeSide: grows with the square root of member count", () => {
  assert.equal(nodeSide(1), LOD.leafSide);
  assert.ok(nodeSide(10) > nodeSide(2));
  assert.ok(nodeSide(100) - nodeSide(1) < 100 * (nodeSide(2) - nodeSide(1)), "sublinear");
});

test("visibleCut: zoomed out → top clusters; zoom in → the big cluster splits first", () => {
  const root = buildConstellation(WORLD);
  const out = visibleCut(root, 0.2);
  assert.deepEqual(new Set(out.nodes.map((n) => n.id)), new Set(root.children.map((c) => c.id)), "far out: only top clusters");

  // Zoom until the acme cluster (the biggest) renders past splitPx.
  const acme = root.children.find((c) => c.hubId === "acme")!;
  const scale = (LOD.splitPx + 1) / nodeSide(acme.size);
  const zoomed = visibleCut(root, scale);
  assert.ok(zoomed.expanded.has(acme.id), "the big cluster split");
  assert.ok(!zoomed.nodes.some((n) => n.id === acme.id), "…and left the cut");
  for (const child of acme.children) {
    assert.equal(zoomed.parentOf[child.id], acme.id, "children know their parent (transition seeding)");
  }
  // Still a full partition of the world.
  const all = zoomed.nodes.flatMap((n) => n.memberIds).sort();
  assert.deepEqual(all, WORLD.map((e) => e.id).sort());
});

test("visibleCut: hysteresis — an open cluster survives zooming out until mergePx, and the cut is a fixed point", () => {
  const root = buildConstellation(WORLD);
  const acme = root.children.find((c) => c.hubId === "acme")!;
  const openScale = (LOD.splitPx + 1) / nodeSide(acme.size);
  const opened = visibleCut(root, openScale);
  assert.ok(opened.expanded.has(acme.id));

  // Between mergePx and splitPx: stays open ONLY because it was open.
  const midScale = (LOD.mergePx + 5) / nodeSide(acme.size);
  assert.ok(visibleCut(root, midScale, opened.expanded).expanded.has(acme.id), "hysteresis holds it open");
  assert.ok(!visibleCut(root, midScale).expanded.has(acme.id), "cold cut at the same scale keeps it closed");

  // Below mergePx it finally collapses.
  const farScale = (LOD.mergePx - 5) / nodeSide(acme.size);
  assert.ok(!visibleCut(root, farScale, opened.expanded).expanded.has(acme.id));

  // Fixed point: feeding a cut's own expanded set back changes nothing.
  for (const s of [openScale, midScale, farScale]) {
    const once = visibleCut(root, s, opened.expanded);
    const twice = visibleCut(root, s, once.expanded);
    assert.deepEqual(twice.expanded, once.expanded);
    assert.deepEqual(twice.nodes.map((n) => n.id), once.nodes.map((n) => n.id));
  }
});

test("visibleCut: the hard cap stops expansion — biggest clusters win the budget", () => {
  const big: KnowledgeEntityView[] = [ent("hub", "company", "Hub")];
  for (let c = 0; c < 6; c++) {
    big.push(ent(`c${c}`, "person", `Chief ${c}`, [rel("works_for", "hub"), rel("knows", `c${(c + 1) % 6}`)]));
    for (let i = 0; i < 8; i++) big.push(ent(`c${c}m${i}`, "invoice", `INV-${c}-${i}`, [rel("sent_to", `c${c}`)]));
  }
  const root = buildConstellation(big);
  const out = visibleCut(root, 100, new Set(), { maxVisible: 10 });
  assert.ok(out.nodes.length <= 10, `cap respected (got ${out.nodes.length})`);
  const all = out.nodes.flatMap((n) => n.memberIds).sort();
  assert.deepEqual(all, big.map((e) => e.id).sort(), "capped cut still partitions the world");
});

test("cutEdges: real edges bundle up to their visible representatives", () => {
  const root = buildConstellation(WORLD);
  const adj = buildAdjacency(WORLD);
  const far = visibleCut(root, 0.2);
  const edges = cutEdges(adj, far.nodes);
  const acme = root.children.find((c) => c.hubId === "acme")!;
  const bright = root.children.find((c) => c.hubId === "bright")!;
  // Bob ranks as a hub of his own (degree 2) and stands alone between the two
  // worlds: the only cross-cluster lines are bob↔acme and bob↔bright — every
  // inside-cluster edge vanished into its cluster.
  assert.equal(edges.length, 2);
  assert.ok(edges.every((e) => e.a === "bob" || e.b === "bob"));
  const partners = edges.map((e) => (e.a === "bob" ? e.b : e.a)).sort();
  assert.deepEqual(partners, [acme.id, bright.id].sort());
  assert.ok(edges.every((e) => e.n === 1));

  // Split acme open: its children now link to each other and to bright's cluster.
  const zoomed = visibleCut(root, (LOD.splitPx + 1) / nodeSide(acme.size));
  const zoomedEdges = cutEdges(adj, zoomed.nodes);
  assert.ok(zoomedEdges.length >= 2, "finer cut exposes more lines");
  for (const edge of zoomedEdges) assert.ok(edge.a < edge.b, "canonical ordering");
});
