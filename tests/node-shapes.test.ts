// Unit tests for node shapes phase 2 (lib/datamodo/node-shapes.ts):
// image detection, bookmark URL extraction, dataset-as-node projection.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDatasetNodes,
  DATASET_NODE_PREFIX,
  entityBookmarkUrl,
  entityImageType,
  isDatasetNodeId,
} from "../lib/datamodo/node-shapes.ts";
import { DEFAULT_KINDS } from "../lib/datamodo/ontology.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const fact = (predicate: string, value: string, over: Partial<KnowledgeFactView> = {}): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 1, provenance: [], confidence: 0.9, validFrom: null, ...over,
});

const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], naturalKeys: Record<string, string> = {}): KnowledgeEntityView => ({
  id, kind, label, naturalKeys, facts, edges: facts.length, bodyMd: null, graphPin: null,
});

// --- entityImageType --------------------------------------------------------

test("entityImageType: image documents detected via file_type fact or filename", () => {
  const byFact = ent("d1", "document", "receipt.bin", [fact("file_type", "image/png")], { id: "doc:abc:receipt.bin" });
  assert.equal(entityImageType(byFact), "image/png");

  const byName = ent("d2", "document", "photo.JPG", [], { id: "doc:abc:photo.jpg" });
  assert.equal(entityImageType(byName), "image/jpeg");
});

test("entityImageType: non-images and non-documents stay null", () => {
  assert.equal(entityImageType(ent("d3", "document", "report.pdf", [fact("file_type", "application/pdf")], { id: "doc:abc:report.pdf" })), null);
  assert.equal(entityImageType(ent("p1", "person", "photo.png", [fact("file_type", "image/png")])), null);
  // No natural key (pre-attachment entity) → filename unknown, fact still counts.
  assert.equal(entityImageType(ent("d4", "document", "x", [])), null);
});

// --- entityBookmarkUrl ------------------------------------------------------

test("entityBookmarkUrl: url fact wins; label fallback; http(s) only", () => {
  const withFact = ent("b1", "bookmark", "Great article", [fact("url", "https://example.com/a?b=1")]);
  assert.equal(entityBookmarkUrl(withFact), "https://example.com/a?b=1");

  const labelIsUrl = ent("b2", "bookmark", "http://example.com/tool");
  assert.equal(entityBookmarkUrl(labelIsUrl), "http://example.com/tool");

  // Anything that isn't plain http(s) never becomes a link.
  assert.equal(entityBookmarkUrl(ent("b3", "bookmark", "Great article", [fact("url", "javascript:alert(1)")])), null);
  assert.equal(entityBookmarkUrl(ent("b4", "bookmark", "no url captured")), null);
  // Kind gate: a company with a url fact is not a bookmark card.
  assert.equal(entityBookmarkUrl(ent("c1", "company", "Acme", [fact("url", "https://acme.com")])), null);
});

test("bookmark is a builtin kind with a required url field", () => {
  const bk = DEFAULT_KINDS.find((k) => k.kind === "bookmark");
  assert.ok(bk, "bookmark kind registered");
  assert.equal(bk!.builtin, true);
  const url = bk!.fields.find((f) => f.key === "url");
  assert.equal(url?.required, true);
});

// --- buildDatasetNodes ------------------------------------------------------

test("buildDatasetNodes: datasets project to virtual nodes with contains edges", () => {
  const world = [ent("e1", "invoice", "INV-1"), ent("e2", "invoice", "INV-2")];
  const nodes = buildDatasetNodes(
    [{ id: "ds1", name: "Invoices", columns: 4, rowEntityIds: ["e1", "e2", "e1", "ghost"] }],
    world,
  );
  assert.equal(nodes.length, 1);
  const n = nodes[0];
  assert.equal(n.id, `${DATASET_NODE_PREFIX}ds1`);
  assert.ok(isDatasetNodeId(n.id));
  assert.equal(n.kind, "dataset");
  // Deduped + unknown entity ids dropped.
  assert.equal(n.facts.length, 2);
  assert.deepEqual(n.facts.map((f) => f.refId).sort(), ["e1", "e2"]);
  assert.ok(n.facts.every((f) => f.ref && f.predicate === "contains"));
  assert.equal(n.facts[0].value, "INV-1"); // edge label = the row entity's label
  assert.equal(n.naturalKeys.rows, "2");
  assert.equal(n.naturalKeys.columns, "4");
});

test("buildDatasetNodes: empty/unresolvable datasets are skipped", () => {
  const world = [ent("e1", "invoice", "INV-1")];
  const nodes = buildDatasetNodes(
    [
      { id: "empty", name: "Empty", columns: 2, rowEntityIds: [] },
      { id: "ghosts", name: "Ghosts", columns: 2, rowEntityIds: ["nope"] },
    ],
    world,
  );
  assert.equal(nodes.length, 0);
});
