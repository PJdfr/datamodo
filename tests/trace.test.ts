// Dev-trace core: the transparency collector behind dev mode (trace-core.ts).
// Pure — no DB, no env; clock injected.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTracer, capString, NOOP_TRACER, type TraceJson } from "../lib/datamodo/trace-core.ts";

function clock(start = 0, stepMs = 10) {
  let t = start;
  return () => (t += stepMs);
}

test("records steps in order with relative timestamps", () => {
  const tr = createTracer({ now: clock(), startedAt: "2026-07-19T00:00:00.000Z" });
  tr.step("gate", "worth extracting", { trivial: false });
  tr.step("llm", "call");
  const json = tr.toJSON() as TraceJson;
  assert.equal(json.version, 1);
  assert.equal(json.startedAt, "2026-07-19T00:00:00.000Z");
  assert.equal(json.steps.length, 2);
  assert.equal(json.steps[0].stage, "gate");
  assert.equal(json.steps[0].label, "worth extracting");
  assert.deepEqual(json.steps[0].detail, { trivial: false });
  assert.ok(json.steps[1].t > json.steps[0].t, "timestamps increase");
  assert.equal(json.truncated, undefined);
});

test("caps long strings inside detail, marking the cut", () => {
  const tr = createTracer({ now: clock(), maxString: 50 });
  tr.step("llm", "big prompt", { user: "x".repeat(200), nested: { deep: ["y".repeat(120)] } });
  const step = (tr.toJSON() as TraceJson).steps[0];
  const user = step.detail!.user as string;
  assert.ok(user.length < 200, "string was capped");
  assert.match(user, /truncated 150 of 200 chars/);
  const deep = (step.detail!.nested as { deep: string[] }).deep[0];
  assert.match(deep, /truncated/, "nested strings capped too");
});

test("capString is a no-op under the cap", () => {
  assert.equal(capString("hello", 10), "hello");
  assert.match(capString("hello world", 5), /^hello\n…\[truncated 6 of 11 chars\]$/);
});

test("whole-trace size budget drops detail but keeps steps, marked truncated", () => {
  const tr = createTracer({ now: clock(), maxString: 10_000, maxTotal: 500 });
  tr.step("llm", "first", { payload: "a".repeat(400) });
  tr.step("llm", "second", { payload: "b".repeat(400) }); // over budget
  const json = tr.toJSON() as TraceJson;
  assert.equal(json.steps.length, 2, "steps always recorded");
  assert.match((json.steps[0].detail!.payload as string) ?? "", /^a+$/);
  assert.match(String(json.steps[1].detail!.omitted), /size budget/);
  assert.equal(json.truncated, true);
});

test("wrapLlm records model, prompts, response and duration", async () => {
  const tr = createTracer({ now: clock(0, 25) });
  const fake = {
    name: "mock",
    models: { extract: "m1", escalate: "m2", vision: "m1" },
    chatJSON: async (req: unknown) => {
      void req;
      return { entities: [], facts: [] };
    },
  };
  const wrapped = tr.wrapLlm(fake);
  assert.equal(wrapped.name, "mock");
  assert.deepEqual(wrapped.models, fake.models);
  const res = await wrapped.chatJSON({ model: "m1", system: "SYS", user: "USR", schemaName: "extraction", maxTokens: 100 });
  assert.deepEqual(res, { entities: [], facts: [] }, "result passes through untouched");
  const json = tr.toJSON() as TraceJson;
  const llm = json.steps.find((s) => s.stage === "llm")!;
  assert.match(llm.label, /mock:m1 · extraction/);
  assert.equal(llm.detail!.system, "SYS");
  assert.equal(llm.detail!.user, "USR");
  assert.deepEqual(llm.detail!.response, { entities: [], facts: [] });
  assert.ok(typeof llm.ms === "number" && llm.ms > 0, "duration recorded");
});

test("wrapLlm records the failure and rethrows", async () => {
  const tr = createTracer({ now: clock() });
  const fake = {
    name: "mock",
    models: { extract: "m1" },
    chatJSON: async (req: unknown) => {
      void req;
      throw new Error("boom 500");
    },
  };
  const wrapped = tr.wrapLlm(fake);
  await assert.rejects(() => wrapped.chatJSON({ model: "m1", system: "s", user: "u" }), /boom 500/);
  const llm = (tr.toJSON() as TraceJson).steps[0];
  assert.match(llm.label, /FAILED/);
  assert.equal(llm.detail!.error, "boom 500");
});

test("console mirror gets one compact line per step", () => {
  const lines: string[] = [];
  const tr = createTracer({ now: clock(), log: (l) => lines.push(l) });
  tr.step("gate", "worth extracting");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[trace\] \+\d+ms gate — worth extracting$/);
});

test("NOOP tracer is free and persists nothing", () => {
  assert.equal(NOOP_TRACER.enabled, false);
  NOOP_TRACER.step("llm", "ignored", { user: "x" });
  const provider = { name: "p", models: {}, chatJSON: async () => 1 };
  assert.equal(NOOP_TRACER.wrapLlm(provider), provider, "identity wrap");
  assert.equal(NOOP_TRACER.toJSON(), null);
});

test("non-serializable detail is dropped without killing the step", () => {
  const tr = createTracer({ now: clock() });
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  tr.step("store", "weird detail", circular);
  const step = (tr.toJSON() as TraceJson).steps[0];
  assert.equal(step.label, "weird detail");
  assert.match(String(step.detail!.omitted), /not serializable/);
});
