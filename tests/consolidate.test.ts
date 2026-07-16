// Unit tests for the consolidation pure core (lib/datamodo/consolidate-core.ts)
// — the deterministic half of the background homeostasis pass (P1).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pairKey,
  naturalKeysConflict,
  pickWinner,
  mergedNaturalKeys,
  filterCandidatePairs,
  orphanEligible,
  emptyStats,
  type ConsolidationEntity,
} from "../lib/datamodo/consolidate-core.ts";

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

function ent(over: Partial<ConsolidationEntity> = {}): ConsolidationEntity {
  return {
    id: "e1",
    kind: "company",
    label: "Acme",
    naturalKeys: {},
    support: 1,
    edgeCount: 0,
    bodyMd: null,
    createdAt: days(60),
    ...over,
  };
}

test("pairKey is order-independent", () => {
  assert.equal(pairKey("a", "b"), pairKey("b", "a"));
  assert.notEqual(pairKey("a", "b"), pairKey("a", "c"));
});

test("naturalKeysConflict: shared keys must match; one-sided keys never conflict", () => {
  assert.equal(naturalKeysConflict({ email: "a@x.com" }, { email: "b@x.com" }), true);
  assert.equal(naturalKeysConflict({ email: "A@X.com " }, { email: "a@x.com" }), false); // case/space insensitive
  assert.equal(naturalKeysConflict({ email: "a@x.com" }, { phone: "+1555" }), false);
  assert.equal(naturalKeysConflict({}, { email: "a@x.com" }), false);
});

test("pickWinner: edges beat support beat age", () => {
  const hub = ent({ id: "hub", edgeCount: 9, support: 1 });
  const leaf = ent({ id: "leaf", edgeCount: 1, support: 50 });
  assert.equal(pickWinner(hub, leaf).winner.id, "hub");
  assert.equal(pickWinner(leaf, hub).winner.id, "hub"); // argument order irrelevant

  const corroborated = ent({ id: "c", support: 5 });
  const fresh = ent({ id: "f", support: 1 });
  assert.equal(pickWinner(fresh, corroborated).winner.id, "c");

  const older = ent({ id: "old", createdAt: days(90) });
  const newer = ent({ id: "new", createdAt: days(1) });
  assert.equal(pickWinner(newer, older).winner.id, "old");
});

test("mergedNaturalKeys: winner's values win, loser only adds missing keys", () => {
  assert.deepEqual(
    mergedNaturalKeys({ email: "keep@x.com" }, { email: "drop@x.com", phone: "+1555" }),
    { email: "keep@x.com", phone: "+1555" },
  );
});

test("filterCandidatePairs: dedups to best sim, drops reviewed + key-conflicting pairs", () => {
  const byId = new Map<string, Pick<ConsolidationEntity, "naturalKeys">>([
    ["a", { naturalKeys: {} }],
    ["b", { naturalKeys: {} }],
    ["c", { naturalKeys: { email: "c@x.com" } }],
    ["d", { naturalKeys: { email: "d@x.com" } }],
  ]);
  const out = filterCandidatePairs(
    [
      { aId: "a", bId: "b", sim: 0.6 },
      { aId: "b", bId: "a", sim: 0.9 }, // same pair, higher sim → kept once at 0.9
      { aId: "a", bId: "a", sim: 1 }, // self pair → dropped
      { aId: "c", bId: "d", sim: 0.95 }, // conflicting emails → dropped
      { aId: "a", bId: "d", sim: 0.7 }, // already reviewed → dropped
      { aId: "a", bId: "missing", sim: 0.8 }, // unknown entity → dropped
    ],
    new Set([pairKey("d", "a")]),
    byId,
  );
  assert.deepEqual(out.map((p) => [pairKey(p.aId, p.bId), p.sim]), [[pairKey("a", "b"), 0.9]]);
});

test("orphanEligible: only old, unlinked, uncorroborated, bodyless strays", () => {
  const now = new Date();
  assert.equal(orphanEligible(ent(), now), true); // 60 days old, 0 edges
  assert.equal(orphanEligible(ent({ edgeCount: 1 }), now), false);
  assert.equal(orphanEligible(ent({ support: 2 }), now), false);
  assert.equal(orphanEligible(ent({ bodyMd: "# page" }), now), false);
  assert.equal(orphanEligible(ent({ createdAt: days(3) }), now), false); // too young
  // Thick-node kinds never prune, whatever their state.
  assert.equal(orphanEligible(ent({ kind: "document" }), now), false);
  assert.equal(orphanEligible(ent({ kind: "note" }), now), false);
});

test("orphanEligible: concepts get the short grace period", () => {
  const now = new Date();
  assert.equal(orphanEligible(ent({ kind: "concept", createdAt: days(10) }), now), true);
  assert.equal(orphanEligible(ent({ kind: "concept", createdAt: days(3) }), now), false);
  assert.equal(orphanEligible(ent({ kind: "company", createdAt: days(10) }), now), false); // default 30d
});

test("emptyStats starts at zero everywhere", () => {
  assert.ok(Object.values(emptyStats()).every((v) => v === 0));
});
