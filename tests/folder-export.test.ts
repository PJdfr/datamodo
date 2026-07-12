// Unit tests for the folder-structure export: the pure zip writer
// (lib/datamodo/zip.ts) and the folder-plan core (lib/datamodo/folder-export.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZip, crc32 } from "../lib/datamodo/zip.ts";
import {
  collectExportables,
  parseFolderPlan,
  planFiles,
  renderNodeMarkdown,
  renderFolderReadme,
  sanitizeFolderPath,
  buildFolderPrompt,
} from "../lib/datamodo/folder-export.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

/* ---- zip ---------------------------------------------------------------- */

const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);

test("buildZip: valid structure — local headers, central directory, EOCD agree", () => {
  const enc = new TextEncoder();
  const zip = buildZip(
    [
      { path: "a/hello.md", data: enc.encode("# hi\n") },
      { path: "b.txt", data: enc.encode("world") },
    ],
    new Date("2026-07-12T10:20:30Z"),
  );
  assert.equal(u32(zip, 0), 0x04034b50, "starts with a local file header");
  // EOCD is the last 22 bytes (no comment).
  const eocd = zip.length - 22;
  assert.equal(u32(zip, eocd), 0x06054b50, "ends with EOCD");
  assert.equal(u16(zip, eocd + 10), 2, "two entries");
  const cdOffset = u32(zip, eocd + 16);
  assert.equal(u32(zip, cdOffset), 0x02014b50, "central directory where EOCD says");
  assert.equal(u32(zip, eocd + 12) + cdOffset, eocd, "cd size + offset reach the EOCD");
  // First central entry: crc + size + name match the first file.
  assert.equal(u32(zip, cdOffset + 16), crc32(enc.encode("# hi\n")));
  assert.equal(u32(zip, cdOffset + 24), 5);
  const nameLen = u16(zip, cdOffset + 28);
  assert.equal(new TextDecoder().decode(zip.slice(cdOffset + 46, cdOffset + 46 + nameLen)), "a/hello.md");
  // Deterministic.
  assert.deepEqual(zip, buildZip([{ path: "a/hello.md", data: enc.encode("# hi\n") }, { path: "b.txt", data: enc.encode("world") }], new Date("2026-07-12T10:20:30Z")));
});

test("crc32: known vector", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

/* ---- folder plan --------------------------------------------------------- */

const attr = (predicate: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 2, provenance: [], confidence: 0.9, validFrom: null,
});
const rel = (predicate: string, refId: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const ent = (
  id: string, kind: string, label: string, facts: KnowledgeFactView[] = [],
  over: Partial<KnowledgeEntityView> = {},
): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: facts.length, bodyMd: null, graphPin: null, ...over,
});

const WORLD: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Inc"), // no body, no original → not exportable
  ent("doc1", "document", "contract.pdf", [rel("mentions", "acme", "Acme Inc")], {
    naturalKeys: { id: "doc:abc123:contract.pdf" }, bodyMd: "A contract.",
  }),
  ent("note1", "concept", "Renewal strategy", [rel("about", "acme", "Acme Inc"), attr("status", "draft")], {
    bodyMd: "Push for **multi-year**.",
  }),
];

test("collectExportables: documents + body nodes only; links from both directions", () => {
  const xs = collectExportables(WORLD);
  assert.deepEqual(xs.map((x) => x.id), ["doc1", "note1"]);
  assert.equal(xs[0].hasOriginal, true);
  assert.equal(xs[1].hasOriginal, false);
  assert.deepEqual(xs[0].links, ["Acme Inc"]);
});

test("sanitizeFolderPath: traversal, junk and depth are neutralized", () => {
  assert.equal(sanitizeFolderPath("../../etc//passwd"), "etc/passwd");
  assert.equal(sanitizeFolderPath("Clients/Acme Inc!/2026/Q3/extra"), "clients/acme-inc/2026");
  assert.equal(sanitizeFolderPath("///"), "unsorted");
});

test("parseFolderPlan: unknown ids dropped, unplaced items land in unsorted", () => {
  const xs = collectExportables(WORLD);
  const plan = parseFolderPlan(
    { name: "Acme Files!", placements: [
      { id: "doc1", path: "clients/Acme Inc/contracts" },
      { id: "ghost", path: "x" },
    ] },
    xs,
  );
  assert.equal(plan.name, "acme-files");
  assert.deepEqual(plan.placements, [
    { id: "doc1", path: "clients/acme-inc/contracts" },
    { id: "note1", path: "unsorted" }, // never silently dropped
  ]);
});

test("planFiles: originals keep their extension, body nodes become .md, collisions dedupe", () => {
  const xs = collectExportables(WORLD);
  const plan = parseFolderPlan({ placements: [
    { id: "doc1", path: "acme" }, { id: "note1", path: "acme" },
  ] }, xs);
  const files = planFiles(plan, xs);
  assert.deepEqual(files.map((f) => [f.path, f.mode]), [
    ["acme/contract.pdf", "original"],
    ["acme/renewal-strategy.md", "markdown"],
  ]);
  // Same folder + same label → -2 suffix.
  const twin = [...xs, { ...xs[1], id: "note2" }];
  const plan2 = parseFolderPlan({ placements: twin.map((x) => ({ id: x.id, path: "a" })) }, twin);
  const files2 = planFiles(plan2, twin);
  assert.deepEqual(files2.map((f) => f.path).sort(), ["a/contract.pdf", "a/renewal-strategy-2.md", "a/renewal-strategy.md"]);
});

test("renderNodeMarkdown: facts, connections and the body, deterministic date", () => {
  const md = renderNodeMarkdown(WORLD[2], (id) => (id === "acme" ? "Acme Inc" : null), "2026-07-12");
  assert.match(md, /^# Renewal strategy/);
  assert.match(md, /- \*\*status\*\*: draft _\(2 sources\)_/);
  assert.match(md, /- \*\*about\*\* → Acme Inc/);
  assert.match(md, /Push for \*\*multi-year\*\*\./);
  assert.match(md, /exported from your datamodo graph on 2026-07-12/);
});

test("renderFolderReadme: the tree as text", () => {
  const xs = collectExportables(WORLD);
  const plan = parseFolderPlan({ name: "acme", placements: [{ id: "doc1", path: "contracts" }, { id: "note1", path: "notes" }] }, xs);
  const readme = renderFolderReadme(plan, planFiles(plan, xs), "2026-07-12");
  assert.match(readme, /- \*\*contracts\/\*\*\n  - contract\.pdf/);
  assert.match(readme, /- \*\*notes\/\*\*\n  - renewal-strategy\.md/);
});

test("buildFolderPrompt: inventory only — ids, kinds, labels, links; no bodies", () => {
  const xs = collectExportables(WORLD);
  const { system, user } = buildFolderPrompt("organize by client", xs);
  assert.match(system, /ONLY JSON/);
  assert.match(user, /id=doc1 · document · "contract.pdf" · linked to: Acme Inc/);
  assert.ok(!user.includes("Push for"), "node bodies never reach the prompt");
});
