// Tests for relevance priming (lib/datamodo/priming-core.ts) and its prompt
// rendering (buildUserPrompt's "already in your graph" block).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rankPrimedCandidates,
  conceptsForPrompt,
  renderKnownBlock,
  PRIME_CAP,
  type PrimedCandidate,
} from "../lib/datamodo/priming-core.ts";

const c = (over: Partial<PrimedCandidate>): PrimedCandidate => ({
  kind: "company",
  label: "Acme Group",
  support: 5,
  ...over,
});

test("rankPrimedCandidates: named-in-text beats semantic, dedup by kind+label", () => {
  const out = rankPrimedCandidates(
    [c({ label: "Acme Group", support: 2 }), c({ label: "Brightwave", kind: "company", support: 9 })],
    [c({ label: "acme group", sim: 0.9 }), c({ label: "Northwind", sim: 0.6 })],
  );
  // Lexical first (by support), then ANN by sim; "acme group" deduped case-insensitively.
  assert.deepEqual(out.map((x) => x.label), ["Brightwave", "Acme Group", "Northwind"]);
  assert.equal(out[0].named, true);
  assert.equal(out[2].named, undefined);
});

test("rankPrimedCandidates: semantic strays need support ≥ 2 — unless named or a concept", () => {
  const out = rankPrimedCandidates(
    [c({ label: "One Mention", support: 1 })], // named in text → allowed
    [
      c({ label: "Weak Stray", support: 1, sim: 0.8 }), // semantic + support 1 → dropped
      c({ kind: "concept", label: "hiring", support: 1, sim: 0.7 }), // concept → allowed
      c({ label: "Too Far", support: 9, sim: 0.1 }), // below PRIME_MIN_SIM → dropped
    ],
  );
  assert.deepEqual(out.map((x) => x.label), ["One Mention", "hiring"]);
});

test("rankPrimedCandidates: cap holds", () => {
  const many = Array.from({ length: 30 }, (_, i) => c({ label: `E${i}`, sim: 0.9, support: 3 }));
  assert.equal(rankPrimedCandidates([], many).length, PRIME_CAP);
});

test("conceptsForPrompt: primed concepts first, support fallback fills, dedup", () => {
  const primed = [
    c({ kind: "concept", label: "hiring" }),
    c({ kind: "company", label: "Acme Group" }), // not a concept → skipped here
    c({ kind: "concept", label: "budget" }),
  ];
  const out = conceptsForPrompt(primed, ["budget", "travel", "hiring", "legal"], 4);
  assert.deepEqual(out, ["hiring", "budget", "travel", "legal"]);
});

test("renderKnownBlock: labels + hints + never-force rule, concepts excluded", () => {
  const block = renderKnownBlock([
    { kind: "person", label: "James Porter", hint: "james.porter@brightwave.io" },
    { kind: "company", label: "Acme Group" },
    { kind: "concept", label: "renewals" }, // concepts never in the known block
  ]);
  assert.ok(block);
  assert.match(block, /ALREADY IN the user's graph/);
  assert.match(block, /- person: "James Porter" \(james\.porter@brightwave\.io\)/);
  assert.match(block, /- company: "Acme Group"/);
  assert.match(block, /never force a match/);
  assert.doesNotMatch(block, /concept/);
});

test("renderKnownBlock: nothing but concepts (or nothing) → null", () => {
  assert.equal(renderKnownBlock([{ kind: "concept", label: "hiring" }]), null);
  assert.equal(renderKnownBlock([]), null);
});
