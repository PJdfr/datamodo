// Unit tests for the evidence layer's pure chunker (document-extraction.ts)
// and passage sources in the answer context (answer.ts). Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkDocText, CHUNK_SIZE, MAX_CHUNKS } from "../lib/datamodo/document-extraction.ts";
import { buildAnswerContext } from "../lib/datamodo/answer.ts";
import type { ChunkHit } from "../lib/datamodo/chunks.ts";

test("chunkDocText: PDF pages chunk with page lineage", () => {
  const chunks = chunkDocText({
    text: "ignored when pageTexts present",
    truncated: false,
    pages: 2,
    pageTexts: [
      { page: 1, text: "First page content about carry strategies." },
      { page: 2, text: "Second page content about risk parity." },
    ],
  });
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map((c) => c.page), [1, 2]);
  assert.deepEqual(chunks.map((c) => c.seq), [0, 1]);
  assert.match(chunks[0].text, /carry strategies/);
});

test("chunkDocText: long pages split at boundaries, never mid-word chaos", () => {
  const sentence = "The quick brown fox jumps over the lazy dog and keeps going. ";
  const long = sentence.repeat(60); // ~3.7k chars
  const chunks = chunkDocText({ text: "", truncated: false, pages: 1, pageTexts: [{ page: 1, text: long }] });
  assert.ok(chunks.length >= 3);
  for (const c of chunks) {
    assert.ok(c.text.length <= CHUNK_SIZE + 1, `chunk too big: ${c.text.length}`);
    assert.equal(c.page, 1);
  }
  // Nothing lost: total content survives chunking (modulo trimmed whitespace).
  const total = chunks.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
  assert.equal(total.replace(/\s/g, ""), long.replace(/\s/g, ""));
});

test("chunkDocText: plain text chunks by paragraphs, capped at MAX_CHUNKS", () => {
  const paras = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} ${"x".repeat(1100)}`).join("\n\n");
  const chunks = chunkDocText({ text: paras, truncated: false, pages: null });
  assert.equal(chunks.length, MAX_CHUNKS);
  assert.equal(chunks[0].page, null);
});

test("chunkDocText: empty text yields no chunks", () => {
  assert.deepEqual(chunkDocText({ text: "   ", truncated: false, pages: null }), []);
});

test("buildAnswerContext: passages appear as page-cited sources after rows", () => {
  const passages: ChunkHit[] = [
    { entityId: "d1", docLabel: "report.pdf", page: 3, text: "Carry returns averaged 4.2% annually.", score: 2 },
    { entityId: "d1", docLabel: "report.pdf", page: null, text: "No page here.", score: 1 },
  ];
  const { context, sources } = buildAnswerContext([], [], passages);
  assert.match(context, /\[1\] Passage from document "report\.pdf" \(page 3\): "Carry returns/);
  assert.match(context, /\[2\] Passage from document "report\.pdf": "No page here\."/);
  assert.deepEqual(sources.map((s) => [s.type, s.label]), [
    ["passage", "report.pdf · p.3"],
    ["passage", "report.pdf"],
  ]);
  assert.equal(sources[0].entityId, "d1");
});
