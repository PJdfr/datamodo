import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_TIERS, pickTier, tierModels, parseCgroupLimit, effectiveRamGb } from "../lib/local/sizing.mjs";

// First-run sizing: RAM budget → local model tier (the pure half of the
// wizard). The tier table itself is a product decision from the packaging
// brief — these tests pin the MAPPING, not the exact model names.

test("pickTier: maps RAM budgets to the brief's tiers", () => {
  assert.equal(pickTier(4).name, "tiny");     // ~4 GB → 3B text, no vision
  assert.equal(pickTier(8).name, "standard"); // ~8 GB → 8B + llava (the default)
  assert.equal(pickTier(16).name, "plus");    // ~16 GB → 8B + llama3.2-vision
  assert.equal(pickTier(32).name, "max");     // 32 GB+ → 14B extract model
  assert.equal(pickTier(512).name, "max");
});

test("pickTier: boundaries and junk never crash the wizard", () => {
  assert.equal(pickTier(0).name, "tiny");
  assert.equal(pickTier(-3).name, "tiny");
  assert.equal(pickTier(NaN).name, "tiny");
  assert.equal(pickTier(undefined).name, "tiny");
  assert.equal(pickTier("8").name, "standard"); // numeric string accepted
});

test("tiers: tiny has NO vision model; all tiers embed with nomic-embed-text", () => {
  const tiny = pickTier(4);
  assert.equal(tiny.vision, null);
  for (const t of MODEL_TIERS) assert.equal(t.embed, "nomic-embed-text");
  // 8 GB default has a vision model — images/scanned PDFs must be readable.
  assert.ok(pickTier(8).vision);
});

test("tierModels: distinct, ordered, skips the missing vision", () => {
  const tiny = tierModels(pickTier(4));
  assert.deepEqual(tiny, ["llama3.2:3b", "nomic-embed-text"]);
  const std = tierModels(pickTier(8));
  assert.equal(std.length, 3);
  assert.ok(std.includes("llama3.1:8b") && std.includes("llava"));
});

test("parseCgroupLimit: bytes, 'max', unlimited sentinels, garbage", () => {
  assert.equal(parseCgroupLimit("8589934592\n"), 8589934592);
  assert.equal(parseCgroupLimit("max"), null);
  assert.equal(parseCgroupLimit(""), null);
  assert.equal(parseCgroupLimit("9223372036854771712"), null); // cgroup v1 "no limit"
  assert.equal(parseCgroupLimit("not-a-number"), null);
});

test("effectiveRamGb: min(total, cgroup), one decimal", () => {
  const gb = 1024 ** 3;
  assert.equal(effectiveRamGb(16 * gb, null), 16);
  assert.equal(effectiveRamGb(16 * gb, 8 * gb), 8);   // container limit wins
  assert.equal(effectiveRamGb(7.7 * gb, undefined), 7.7);
  assert.equal(effectiveRamGb(NaN, null), 0);
});
