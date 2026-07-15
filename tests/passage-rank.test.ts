// Unit tests for the passage merge (lib/datamodo/passage-rank.ts) — how
// keyword and semantic (ANN) recall combine in searchChunks. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePassages, type PassageCandidate } from "../lib/datamodo/passage-rank.ts";

const kw = (entityId: string, seq: number, score: number, text = "keyword text"): PassageCandidate => ({
  entityId, seq, score, text, docLabel: `${entityId}.pdf`, page: 1,
});
const sem = (entityId: string, seq: number, sim: number, text = "semantic text"): PassageCandidate => ({
  entityId, seq, score: sim, text, docLabel: `${entityId}.pdf`, page: 1,
});

test("mergePassages: semantic-only hits backfill BELOW every keyword hit", () => {
  const out = mergePassages([kw("a", 0, 1)], [sem("b", 0, 0.93)]);
  assert.deepEqual(out.map((h) => h.entityId), ["a", "b"], "keyword (score 1) outranks semantic (0.93)");
});

test("mergePassages: a passage found by BOTH paths gets its similarity as a boost", () => {
  const out = mergePassages(
    [kw("a", 0, 1), kw("b", 0, 1)],
    [sem("a", 0, 0.8)],
  );
  assert.equal(out[0].entityId, "a", "the boosted passage wins the tie");
  assert.equal(out[0].score, 1.8);
  assert.equal(out.length, 2, "no duplicate row for the both-paths passage");
});

test("mergePassages: at most 2 passages per document, limit overall", () => {
  const out = mergePassages(
    [kw("a", 0, 5), kw("a", 1, 4), kw("a", 2, 3), kw("b", 0, 2)],
    [sem("c", 0, 0.5), sem("d", 0, 0.4)],
    { limit: 4 },
  );
  assert.deepEqual(out.map((h) => [h.entityId, h.score]), [["a", 5], ["a", 4], ["b", 2], ["c", 0.5]]);
});

test("mergePassages: long text snips at 400 chars; order is deterministic on ties", () => {
  const long = "x".repeat(1000);
  const out = mergePassages([kw("b", 1, 1, long), kw("b", 0, 1), kw("a", 0, 1)], []);
  assert.equal(out[0].entityId, "a", "ties break by entity then seq");
  assert.equal(out[1].entityId, "b");
  assert.ok(out.every((h) => h.text.length <= 401));
});
