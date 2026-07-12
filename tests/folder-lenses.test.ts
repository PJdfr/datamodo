// Unit tests for folder lenses (lib/datamodo/folder-lenses.ts): deterministic
// multi-tree folders derived from the graph — no LLM anywhere.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectFiledDocs,
  availableLenses,
  lensValues,
  buildLensTree,
  treeToPlacements,
  UNFILED,
} from "../lib/datamodo/folder-lenses.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const prov = (receivedAt: string, channel = "email") => [
  { channel, sender: "a@b.c", subject: null, preview: null, snippet: null, receivedAt },
];
const attr = (predicate: string, value: string, over: Partial<KnowledgeFactView> = {}): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 1, provenance: [], confidence: 1, validFrom: null, ...over,
});
const rel = (predicate: string, refId: string, value: string, over: Partial<KnowledgeFactView> = {}): KnowledgeFactView => ({
  predicate, value, ref: true, refId, sources: 1, provenance: [], confidence: 1, validFrom: null, ...over,
});
const ent = (
  id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], over: Partial<KnowledgeEntityView> = {},
): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: facts.length, bodyMd: null, graphPin: null, ...over,
});

const WORLD: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Group"),
  ent("bw", "company", "Brightwave"),
  ent("proj", "project", "Q3 Rebrand"),
  ent("conc", "concept", "pricing strategy"),
  // Linked to BOTH companies — must appear in both client folders.
  ent("d1", "document", "msa.pdf", [
    attr("file_type", "application/pdf", { provenance: prov("2026-06-10T10:00:00Z") }),
    rel("mentions", "acme", "Acme Group"),
    rel("mentions", "bw", "Brightwave"),
  ], { naturalKeys: { id: "doc:h1:msa.pdf" } }),
  ent("d2", "document", "receipt.jpg", [
    attr("file_type", "image/jpeg", { provenance: prov("2026-07-02T10:00:00Z", "whatsapp") }),
    rel("mentions", "acme", "Acme Group"),
    rel("mentions", "proj", "Q3 Rebrand"),
  ], { naturalKeys: { id: "doc:h2:receipt.jpg" } }),
  // A note ABOUT a concept, incoming link from the project.
  ent("n1", "note", "Pricing thoughts", [rel("about", "conc", "pricing strategy")], { bodyMd: "..." }),
  ent("proj2", "project", "Website", [rel("references", "n1", "Pricing thoughts")]),
];

test("collectFiledDocs: documents + notes with links (both directions), time and type", () => {
  const docs = collectFiledDocs(WORLD);
  assert.deepEqual(docs.map((d) => d.id), ["d1", "n1", "d2"]); // label-sorted
  const d1 = docs.find((d) => d.id === "d1")!;
  assert.equal(d1.hasOriginal, true);
  assert.equal(d1.fileType, "application/pdf");
  assert.equal(d1.receivedAt, "2026-06-10T10:00:00Z");
  const n1 = docs.find((d) => d.id === "n1")!;
  assert.ok(n1.links.some((l) => l.id === "proj2"), "incoming links count as tags too");
});

test("lensValues: a doc linked to two clients is IN both folders (folder = tag)", () => {
  const docs = collectFiledDocs(WORLD);
  const d1 = docs.find((d) => d.id === "d1")!;
  assert.deepEqual(lensValues(d1, "client").sort(), ["Acme Group", "Brightwave"]);
  assert.deepEqual(lensValues(d1, "month"), ["2026-06 Jun"]);
  assert.deepEqual(lensValues(d1, "type"), ["pdfs"]);
  const n1 = docs.find((d) => d.id === "n1")!;
  assert.deepEqual(lensValues(n1, "topic"), ["pricing strategy"]);
  assert.deepEqual(lensValues(n1, "client"), [], "no client link → unfiled under that lens");
});

test("availableLenses: only lenses that actually discriminate this corpus", () => {
  const docs = collectFiledDocs(WORLD);
  const keys = availableLenses(docs).map((l) => l.key);
  assert.ok(keys.includes("client"));
  assert.ok(keys.includes("month"));
  assert.ok(keys.includes("type"));
});

test("buildLensTree: one level — size-ordered folders, unfiled sinks last", () => {
  const docs = collectFiledDocs(WORLD);
  const tree = buildLensTree(docs, ["client"]);
  assert.deepEqual(tree.map((f) => [f.name, f.total]), [
    ["Acme Group", 2], ["Brightwave", 1], [UNFILED, 1],
  ]);
  assert.deepEqual(buildLensTree(docs, ["client"]), tree, "deterministic");
});

test("buildLensTree: stacked lenses nest; single-member groups keep the doc at the level", () => {
  const docs = collectFiledDocs(WORLD);
  const tree = buildLensTree(docs, ["client", "month"]);
  const acme = tree.find((f) => f.name === "Acme Group")!;
  assert.equal(acme.docs.length, 0, "docs live in the leaves");
  assert.deepEqual(acme.children.map((c) => c.name).sort(), ["2026-06 Jun", "2026-07 Jul"]);
  const bw = tree.find((f) => f.name === "Brightwave")!;
  assert.equal(bw.children.length, 0, "a lone doc doesn't get a one-doc subfolder");
  assert.equal(bw.docs.length, 1);
});

test("treeToPlacements: mirrors the tree, doc-in-two-folders exports twice", () => {
  const docs = collectFiledDocs(WORLD);
  const placements = treeToPlacements(buildLensTree(docs, ["client"]));
  const d1Paths = placements.filter((p) => p.id === "d1").map((p) => p.path).sort();
  assert.deepEqual(d1Paths, ["Acme Group", "Brightwave"]);
});
