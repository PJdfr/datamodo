// Unit tests for the on-demand synthesis core (lib/datamodo/synthesis.ts).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSynthesisPrompt,
  canSynthesize,
  collectSynthesisSources,
  MAX_EXCERPT_CHARS,
  MAX_SYNTHESIS_SOURCES,
  renderSynthesisBody,
} from "../lib/datamodo/synthesis.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

const rel = (predicate: string, refId: string): KnowledgeFactView => ({
  predicate, value: "?", ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const attr = (predicate: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], over: Partial<KnowledgeEntityView> = {}): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: facts.length, bodyMd: null, graphPin: null, ...over,
});

// A concept two documents are about (one linked doc→concept, one concept→doc),
// plus a thin entity (no body — never a source) and an unrelated document.
const WORLD = [
  ent("lance", "concept", "Lance format", [rel("related_to", "note1")], { edges: 3 }),
  ent("doc1", "document", "lance-paper.pdf", [rel("about", "lance")], { bodyMd: "# Paper\nColumnar storage for ML.", edges: 2 }),
  ent("note1", "note", "Storage braindump", [], { bodyMd: "Thinking about storage engines.", edges: 1 }),
  ent("bob", "person", "Bob", [rel("works_for", "lance")], { edges: 1 }), // thin — no body
  ent("other", "document", "unrelated.pdf", [], { bodyMd: "Nothing to do with it." }),
];

test("collectSynthesisSources: linked content in either direction, body required", () => {
  const sources = collectSynthesisSources(WORLD[0], WORLD);
  assert.deepEqual(sources.map((s) => s.id), ["doc1", "note1"]); // edges desc
  assert.deepEqual(sources.map((s) => s.n), [1, 2]);
  assert.ok(sources.every((s) => s.excerpt.length > 0));
});

test("collectSynthesisSources: caps sources and excerpt length", () => {
  const docs = Array.from({ length: 12 }, (_, i) =>
    ent(`d${i}`, "document", `doc${i}.pdf`, [rel("about", "hub")], { bodyMd: "x".repeat(MAX_EXCERPT_CHARS + 500), edges: i }),
  );
  const hub = ent("hub", "concept", "Hub");
  const sources = collectSynthesisSources(hub, [hub, ...docs]);
  assert.equal(sources.length, MAX_SYNTHESIS_SOURCES);
  assert.ok(sources.every((s) => s.excerpt.length === MAX_EXCERPT_CHARS));
});

test("canSynthesize: needs at least two sources", () => {
  assert.equal(canSynthesize(WORLD[0], WORLD), true);
  assert.equal(canSynthesize(WORLD[3], WORLD), false); // bob: 1 linked body (lance has none)
  assert.equal(canSynthesize(WORLD[4], WORLD), false); // unrelated: no links
});

test("buildSynthesisPrompt: numbered sources + grounding rules + attributes", () => {
  const sources = collectSynthesisSources(WORLD[0], WORLD);
  const subject = { ...WORLD[0], facts: [...WORLD[0].facts, attr("definition", "a columnar format")] };
  const { system, user } = buildSynthesisPrompt(subject, sources);
  assert.match(system, /ONLY the numbered sources/);
  assert.match(system, /note_md/);
  assert.match(user, /\[1\] lance-paper\.pdf \(document\)/);
  assert.match(user, /\[2\] Storage braindump \(note\)/);
  assert.match(user, /definition: a columnar format/);
});

test("renderSynthesisBody: note + deterministic sources footer + stamp", () => {
  const sources = collectSynthesisSources(WORLD[0], WORLD);
  const body = renderSynthesisBody("A note. [1][2]", sources, "2026-07-11");
  assert.match(body, /^A note\. \[1\]\[2\]/);
  assert.match(body, /#### Sources/);
  assert.match(body, /1\. lance-paper\.pdf \(document\)/);
  assert.match(body, /2\. Storage braindump \(note\)/);
  assert.match(body, /Synthesized on 2026-07-11 from 2 sources/);
});
