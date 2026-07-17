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
