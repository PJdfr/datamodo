// Tests for the adaptive-routing learning rules (lib/datamodo/routing-learn.ts)
// — centroid folding, term-weight corrections, and the centroid score boost.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import {
  centroidBoost,
  foldCentroid,
  learnTermWeights,
  CENTROID_MEMORY,
  CENTROID_SIM_FLOOR,
  MAX_LEARNED_TERMS,
} from "../lib/datamodo/routing-learn.ts";

test("foldCentroid: starts fresh, averages incrementally", () => {
  const first = foldCentroid(null, 0, [[1, 0]]);
  assert.deepEqual(first, { centroid: [1, 0], n: 1 });
  const second = foldCentroid(first!.centroid, first!.n, [[0, 1]]);
  assert.equal(second!.n, 2);
  assert.ok(Math.abs(second!.centroid[0] - 0.5) < 1e-9);
  assert.ok(Math.abs(second!.centroid[1] - 0.5) < 1e-9);
});

test("foldCentroid: batch fold equals sequential fold", () => {
  const batch = foldCentroid(null, 0, [[1, 0], [0, 1], [1, 1]]);
  let seq = foldCentroid(null, 0, [[1, 0]]);
  seq = foldCentroid(seq!.centroid, seq!.n, [[0, 1]]);
  seq = foldCentroid(seq!.centroid, seq!.n, [[1, 1]]);
  assert.equal(batch!.n, seq!.n);
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(batch!.centroid[i] - seq!.centroid[i]) < 1e-9);
});

test("foldCentroid: memory cap keeps the centroid adaptive", () => {
  // A huge prior count would freeze the mean; the cap keeps new messages
  // moving it at ~1/CENTROID_MEMORY per fold.
  const folded = foldCentroid([1, 0], 100_000, [[0, 1]]);
  assert.ok(folded!.centroid[1] >= 1 / (CENTROID_MEMORY + 1) - 1e-9, "new vector still moves the centroid");
  assert.equal(folded!.n, 100_001);
});

test("foldCentroid: dimension mismatches never fold; empty input echoes prev", () => {
  const kept = foldCentroid([1, 0], 4, [[1, 2, 3]]);
  assert.deepEqual(kept, { centroid: [1, 0], n: 4 });
  assert.deepEqual(foldCentroid([1, 0], 4, []), { centroid: [1, 0], n: 4 });
  assert.equal(foldCentroid(null, 0, []), null);
});

test("learnTermWeights: accepts push terms up, rejects push down, clamped ±1", () => {
  const accepted = { verdict: "accept" as const, text: "invoice from the supplier for consulting" };
  const w1 = learnTermWeights({}, [accepted]);
  assert.ok((w1.invoice ?? 0) > 0);
  assert.ok((w1.consulting ?? 0) > 0);
  const many = learnTermWeights({}, Array.from({ length: 10 }, () => accepted));
  assert.equal(many.invoice, 1, "clamped at +1");
  const rejected = learnTermWeights({}, Array.from({ length: 10 }, () => ({
    verdict: "reject" as const,
    text: "newsletter digest roundup",
  })));
  assert.equal(rejected.newsletter, -1, "clamped at -1");
});

test("learnTermWeights: prunes to the strongest corrections", () => {
  const events = Array.from({ length: 40 }, (_, i) => ({
    verdict: "accept" as const,
    text: `uniqueterm${i} filler`,
  }));
  const w = learnTermWeights({}, events);
  assert.ok(Object.keys(w).length <= MAX_LEARNED_TERMS);
  // "filler" appeared in every event → strongest → survives the prune.
  assert.ok((w.filler ?? 0) > 0);
});

test("centroidBoost: 0 below the floor, capped at 2, monotone", () => {
  assert.equal(centroidBoost(null), 0);
  assert.equal(centroidBoost(CENTROID_SIM_FLOOR), 0);
  assert.equal(centroidBoost(0.1), 0);
  const mid = centroidBoost(0.5);
  assert.ok(mid > 0 && mid < 2);
  assert.equal(centroidBoost(0.9), 2);
  assert.ok(centroidBoost(0.6) > centroidBoost(0.4));
});
