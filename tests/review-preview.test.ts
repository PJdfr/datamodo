// Tests for the per-row review graph preview core
// (lib/datamodo/review-preview.ts): the accept/refuse scenes for merges,
// orphan batches, and fact conflicts.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReviewPreview } from "../lib/datamodo/review-preview.ts";
import type { KnowledgeEntityView } from "../lib/datamodo/types.ts";

const view = (id: string, label: string, kind: string, facts: KnowledgeEntityView["facts"] = []): KnowledgeEntityView => ({
  id, label, kind, naturalKeys: {}, bodyMd: null, graphPin: null, edges: facts.length, facts,
});
const edge = (predicate: string, value: string, refId: string): KnowledgeEntityView["facts"][number] => ({
  predicate, value, ref: true, refId, sources: 1, provenance: [], confidence: 1, validFrom: null,
});

const VIEWS: KnowledgeEntityView[] = [
  view("a", "Acme", "company", [edge("hired", "James Porter", "p1")]),
  view("b", "Acme Group", "company", [edge("issued", "INV-9", "i1")]),
  view("p1", "James Porter", "person"),
  view("i1", "INV-9", "invoice"),
];

test("merge preview: refuse keeps two stars; accept folds A into B with re-pointed edges", () => {
  const p = buildReviewPreview(VIEWS, {
    kind: "entity_merge", sourceEntityId: "a", sourceLabel: "Acme", targetEntityId: "b", targetLabel: "Acme Group",
  })!;
  // Refuse: both centers, each with its own neighbor.
  assert.equal(p.refuse.nodes.filter((n) => n.role === "center").length, 2);
  assert.ok(p.refuse.edges.every((e) => e.state === "keep"));
  // Accept: one center, A is a ghost merging in, A's neighbor arrives as "add".
  const centers = p.accept.nodes.filter((n) => n.role === "center");
  assert.equal(centers.length, 1);
  assert.equal(centers[0].label, "Acme Group");
  assert.ok(p.accept.nodes.some((n) => n.role === "ghost" && n.label === "Acme"));
  assert.ok(p.accept.edges.some((e) => e.predicate === "merges into" && e.state === "add"));
  assert.ok(p.accept.edges.some((e) => e.predicate === "hired" && e.state === "add"), "loser's edge re-points as add");
  assert.ok(p.accept.edges.some((e) => e.predicate === "issued" && e.state === "keep"), "winner's edge stays");
});

test("merge preview: shared neighbors collapse to ONE node on accept", () => {
  const shared: KnowledgeEntityView[] = [
    view("a", "Acme", "company", [edge("hired", "James", "p1")]),
    view("b", "Acme Group", "company", [edge("hired", "James", "p1")]),
    view("p1", "James", "person"),
  ];
  const p = buildReviewPreview(shared, { kind: "entity_merge", sourceEntityId: "a", targetEntityId: "b" })!;
  assert.equal(p.accept.nodes.filter((n) => n.label === "James").length, 1);
});

test("merge preview works label-only (simulated rows without ids)", () => {
  const p = buildReviewPreview([], { kind: "entity_merge", sourceLabel: "J. Porter", targetLabel: "James Porter" })!;
  assert.ok(p.accept.nodes.some((n) => n.role === "ghost" && n.label === "J. Porter"));
  assert.equal(p.refuse.nodes.filter((n) => n.role === "center").length, 2);
});

test("orphan preview: accept fades, refuse keeps, both list the strays", () => {
  const p = buildReviewPreview([], {
    kind: "orphan_prune",
    orphans: [{ id: "x", label: "stray one", kind: "concept" }, { label: "stray two", kind: "thing" }],
  })!;
  assert.ok(p.accept.nodes.every((n) => n.role === "fade"));
  assert.ok(p.refuse.nodes.every((n) => n.role === "neighbor"));
  assert.match(p.accept.note, /STILL unlinked/);
});

test("conflict preview: accept keeps the new value, refuse restores the old", () => {
  const p = buildReviewPreview(VIEWS, {
    kind: "fact_conflict", subjectEntityId: "b", predicate: "amount", was: "$18,500", now: "$17,650",
  })!;
  const acceptNow = p.accept.nodes.find((n) => n.key === "val:now")!;
  const acceptWas = p.accept.nodes.find((n) => n.key === "val:was")!;
  assert.equal(acceptNow.role, "value");
  assert.equal(acceptWas.role, "fade");
  const refuseWas = p.refuse.nodes.find((n) => n.key === "val:was")!;
  assert.equal(refuseWas.role, "value");
  assert.match(p.refuse.note, /previous value becomes current/i);
});

test("kinds without a graph shape return null", () => {
  assert.equal(buildReviewPreview([], { kind: "orphan_prune", orphans: [] }), null);
});
