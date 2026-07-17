// Tests for the chunk-importance selector (lib/datamodo/chunk-select.ts) —
// the zero-LLM classifier that decides which passages of an unbounded
// document ride the distill prompt.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keyTermsFrom,
  scoreChunk,
  selectChunksForPrompt,
  DOC_PROMPT_BUDGET_CHARS,
} from "../lib/datamodo/chunk-select.ts";
import type { DocChunk } from "../lib/datamodo/document-extraction.ts";

const chunk = (seq: number, text: string, page: number | null = seq + 1): DocChunk => ({ seq, page, text });

test("keyTermsFrom: tokenizes labels + purposes, ≥4 chars, deduped", () => {
  const terms = keyTermsFrom("sharpe Sharpe ratio", "ann_return Annualized return", null, "of it");
  assert.ok(terms.includes("sharpe"));
  assert.ok(terms.includes("annualized"));
  assert.ok(!terms.includes("of"));
  assert.equal(terms.filter((t) => t === "sharpe").length, 1);
});

test("scoreChunk: results/density/key-terms up, references down", () => {
  const ctx = { totalChunks: 20, keyTerms: keyTermsFrom("sharpe lookback drawdown") };
  const results = scoreChunk(chunk(10, "Results: the strategy earns 14.2% with a Sharpe of 1.31 and max drawdown of -18%."), ctx);
  const refs = scoreChunk(chunk(18, "References\n[1] Jegadeesh, N. and Titman, S. (1993)…"), ctx);
  const prose = scoreChunk(chunk(10, "The broader literature on asset pricing has long debated these questions."), ctx);
  assert.ok(results > prose, `results (${results}) should beat plain prose (${prose})`);
  assert.ok(prose > refs, `prose (${prose}) should beat references (${refs})`);
});

test("selectChunksForPrompt: short documents pass through whole", () => {
  const chunks = [chunk(0, "abstract"), chunk(1, "body")];
  const sel = selectChunksForPrompt(chunks, { keyTerms: [] });
  assert.equal(sel.droppedChunks, 0);
  assert.equal(sel.text, "abstract\n\nbody");
});

test("selectChunksForPrompt: long documents keep openings + best chunks, in order, page-marked", () => {
  const filler = "the committee discussed general matters at some length. ".repeat(20); // ~1.1k, low score
  const chunks: DocChunk[] = [
    chunk(0, `Title page: Cross-Sectional Momentum. ${filler}`),
    chunk(1, `Abstract: we document momentum. ${filler}`),
    ...Array.from({ length: 30 }, (_, i) => chunk(2 + i, `${filler}`)),
    chunk(32, `Results: Sharpe 1.31, annualized return 14.2%, drawdown -18%. ${filler}`),
    chunk(33, `References [1] [2] [3]. ${filler}`),
  ];
  const sel = selectChunksForPrompt(chunks, {
    keyTerms: keyTermsFrom("sharpe annualized drawdown"),
    budgetChars: 6_000,
  });
  assert.ok(sel.includedSeqs.includes(0), "title always included");
  assert.ok(sel.includedSeqs.includes(1), "abstract always included");
  assert.ok(sel.includedSeqs.includes(32), "the results chunk wins a slot");
  assert.ok(!sel.includedSeqs.includes(33), "references lose");
  assert.ok(sel.droppedChunks > 0);
  // Document order + markers.
  assert.deepEqual(sel.includedSeqs, [...sel.includedSeqs].sort((a, b) => a - b));
  assert.match(sel.text, /\[p\.33\] Results/);
  assert.match(sel.text, /less relevant passages omitted/);
  assert.ok(sel.text.length <= 6_000 + 200); // budget + markers
});

test("selectChunksForPrompt: default budget engages only above it", () => {
  const one = chunk(0, "x".repeat(DOC_PROMPT_BUDGET_CHARS - 10));
  assert.equal(selectChunksForPrompt([one], { keyTerms: [] }).droppedChunks, 0);
});

// ---- semantic leg (2026-07-17): embed-before-select chunk ranking ----

import { buildContextAnchors, cosineSim, semanticBoost } from "../lib/datamodo/chunk-select.ts";

test("cosineSim: basics + degenerate inputs", () => {
  assert.equal(cosineSim([1, 0], [1, 0]), 1);
  assert.equal(cosineSim([1, 0], [0, 1]), 0);
  assert.equal(cosineSim([1, 0], [-1, 0]), -1);
  assert.equal(cosineSim([], []), 0);
  assert.equal(cosineSim([1, 0], [1, 0, 0]), 0, "dim mismatch is 0, never throws");
  assert.equal(cosineSim([0, 0], [1, 0]), 0, "zero vector");
});

test("semanticBoost: 0 at/below the floor, capped at 3", () => {
  assert.equal(semanticBoost(null), 0);
  assert.equal(semanticBoost(0.25), 0);
  assert.equal(semanticBoost(0.9), 3);
  assert.ok(semanticBoost(0.45) > 0 && semanticBoost(0.45) < 3);
  assert.ok(semanticBoost(0.6) > semanticBoost(0.4));
});

test("buildContextAnchors: business context + agents + kind templates, capped", () => {
  const anchors = buildContextAnchors({
    businessContext: "Freelance quant consultant tracking fund performance",
    agents: [{ name: "Bookkeeper", purpose: "invoices and payments" }],
    kinds: [
      {
        kind: "strategy",
        description: "A trading strategy",
        fields: [{ key: "sharpe", label: "Sharpe ratio" }],
        relations: [{ predicate: "managed_by", label: "Managed by" }],
      },
      { kind: "bare", description: null, fields: [], relations: [] },
    ],
  });
  assert.equal(anchors.length, 3, "empty kind contributes nothing");
  assert.match(anchors[0], /quant consultant/);
  assert.match(anchors[1], /Bookkeeper — invoices/);
  assert.match(anchors[2], /strategy: A trading strategy.*Sharpe ratio.*Managed by/);
  assert.deepEqual(buildContextAnchors({}), []);
});

test("selectChunksForPrompt: a paraphrase chunk with zero lexical overlap wins via the semantic leg", () => {
  const filler = "the committee discussed general matters at some length today. ".repeat(20);
  const chunks: DocChunk[] = [
    chunk(0, `Title page. ${filler}`),
    chunk(1, `Abstract. ${filler}`),
    ...Array.from({ length: 20 }, (_, i) => chunk(2 + i, filler)),
    // The payoff chunk, phrased so no key term appears literally.
    chunk(22, `Risk-adjusted outperformance was substantial across the sample. ${filler}`),
  ];
  const base = { keyTerms: ["sharpe"], budgetChars: 4_000 };
  const without = selectChunksForPrompt(chunks, base);
  assert.ok(!without.includedSeqs.includes(22), "lexically invisible");

  // Chunk 22 sits near the anchor; everything else far from it.
  const chunkVectors = chunks.map((c) => (c.seq === 22 ? [1, 0] : [0, 1]));
  const withSem = selectChunksForPrompt(chunks, {
    ...base,
    chunkVectors,
    anchorVectors: [[0.9, 0.1]],
  });
  assert.ok(withSem.includedSeqs.includes(22), "semantic closeness carries it into the prompt");
  assert.ok(withSem.includedSeqs.includes(0) && withSem.includedSeqs.includes(1), "openings still guaranteed");
});

test("selectChunksForPrompt: missing/null vectors leave the structural selection unchanged", () => {
  const filler = "x".repeat(1000);
  const chunks: DocChunk[] = Array.from({ length: 10 }, (_, i) => chunk(i, filler));
  const a = selectChunksForPrompt(chunks, { keyTerms: [], budgetChars: 5_000 });
  const b = selectChunksForPrompt(chunks, { keyTerms: [], budgetChars: 5_000, chunkVectors: null, anchorVectors: null });
  const c = selectChunksForPrompt(chunks, {
    keyTerms: [],
    budgetChars: 5_000,
    chunkVectors: chunks.map(() => null),
    anchorVectors: [[1, 0]],
  });
  assert.deepEqual(b.includedSeqs, a.includedSeqs);
  assert.deepEqual(c.includedSeqs, a.includedSeqs);
});
