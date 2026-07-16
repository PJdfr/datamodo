// Unit tests for the BYOK cost core (lib/datamodo/llm-cost.ts) — pricing
// token usage from the model id. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCostUsd, priceFor, isPriced } from "../lib/datamodo/llm-cost.ts";

test("priceFor: dated model ids match their family; longest prefix wins", () => {
  assert.equal(priceFor("claude-haiku-4-5-20251001")?.inPerM, 1, "dated Haiku → haiku family");
  assert.equal(priceFor("claude-opus-4-8")?.outPerM, 75, "opus-4-8 → opus prices");
  // gpt-4o-mini must beat the shorter gpt-4o prefix.
  assert.equal(priceFor("gpt-4o-mini")?.inPerM, 0.15);
  assert.equal(priceFor("gpt-4o")?.inPerM, 2.5);
  assert.equal(priceFor("gpt-4.1")?.inPerM, 2);
});

test("estimateCostUsd: input + output priced per 1M tokens", () => {
  // 1M in + 1M out on Sonnet ($3 / $15) = $18.
  assert.equal(estimateCostUsd("claude-sonnet-5", 1_000_000, 1_000_000), 18);
  // 200k in + 50k out on gpt-4o-mini ($0.15 / $0.60) = 0.03 + 0.03 = 0.06.
  assert.equal(estimateCostUsd("gpt-4o-mini", 200_000, 50_000), 0.06);
  // Sub-cent calls still register (rounded to µ-dollars, not zeroed).
  assert.ok((estimateCostUsd("claude-haiku-4-5", 1000, 500) ?? 0) > 0);
});

test("estimateCostUsd: embeddings price input only (output = 0)", () => {
  // 1M tokens at $0.02/M, output ignored.
  assert.equal(estimateCostUsd("text-embedding-3-small", 1_000_000, 0), 0.02);
});

test("estimateCostUsd: unknown / local models are unpriced (null), not guessed", () => {
  assert.equal(estimateCostUsd("llama3.1", 1_000_000, 1_000_000), null);
  assert.equal(estimateCostUsd("some/random-model:free", 500, 500), null);
  assert.equal(isPriced("claude-haiku-4-5"), true);
  assert.equal(isPriced("llama3.1"), false);
});

// --- byokCapDecision (the monthly spend cap's pure rule) ------------------------

test("byokCapDecision: no cap / under cap → ok", async () => {
  const { byokCapDecision } = await import("../lib/datamodo/llm-cost.ts");
  assert.equal(byokCapDecision(999, null, false), "ok");
  assert.equal(byokCapDecision(999, undefined, true), "ok");
  assert.equal(byokCapDecision(0, 10, false), "ok");
  assert.equal(byokCapDecision(9.99, 10, true), "ok");
  // A zero/negative/NaN cap can't be a real ceiling — treated as no cap.
  assert.equal(byokCapDecision(5, 0, false), "ok");
  assert.equal(byokCapDecision(5, -1, false), "ok");
  assert.equal(byokCapDecision(5, Number.NaN, false), "ok");
});

test("byokCapDecision: at/over cap → local falls back, cloud blocks", async () => {
  const { byokCapDecision } = await import("../lib/datamodo/llm-cost.ts");
  assert.equal(byokCapDecision(10, 10, true), "fallback");
  assert.equal(byokCapDecision(10.01, 10, true), "fallback");
  assert.equal(byokCapDecision(10, 10, false), "block");
  assert.equal(byokCapDecision(10.01, 10, false), "block");
});
