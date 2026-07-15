// Unit tests for parseLoose — salvaging JSON from imperfect LLM output (local
// models especially). Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLoose } from "../lib/llm/util.ts";

test("parseLoose: clean object", () => {
  assert.deepEqual(parseLoose('{"a":1,"b":"x"}'), { a: 1, b: "x" });
});

test("parseLoose: ```json fence", () => {
  assert.deepEqual(parseLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseLoose('```\n{"a":1}\n```'), { a: 1 });
});

test("parseLoose: leading/trailing prose around the JSON", () => {
  assert.deepEqual(parseLoose('Sure! Here is the result:\n{"kind":"invoice","total":42}\nHope that helps.'), {
    kind: "invoice",
    total: 42,
  });
});

test("parseLoose: arrays, not just objects", () => {
  assert.deepEqual(parseLoose('[{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseLoose('Here you go: [1,2,3]'), [1, 2, 3]);
});

test("parseLoose: trailing commas", () => {
  assert.deepEqual(parseLoose('{"a":1,"b":[1,2,],}'), { a: 1, b: [1, 2] });
});

test("parseLoose: does NOT greedily span past the first object", () => {
  // A greedy /\{[\s\S]*\}/ would grab "{...} and then {...}" and fail; balanced
  // extraction takes just the first complete object.
  assert.deepEqual(parseLoose('{"a":1} then some junk {oops'), { a: 1 });
});

test("parseLoose: braces inside strings don't confuse the balancer", () => {
  assert.deepEqual(parseLoose('prefix {"note":"a } brace in text","n":2} suffix'), {
    note: "a } brace in text",
    n: 2,
  });
});

test("parseLoose: unsalvageable input throws with a snippet", () => {
  assert.throws(() => parseLoose("the model refused and wrote only prose"), /was not valid JSON — got: the model refused/);
});
