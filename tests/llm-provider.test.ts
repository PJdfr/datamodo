// Unit tests for provider routing (lib/llm/index.ts) — the Ollama keyless
// path in particular: URL normalization, no auth header, key still required
// for key-billed providers. fetch is stubbed; nothing leaves the process.
// Run with: npm test

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getLlmProvider, normalizeOllamaUrl } from "../lib/llm/index.ts";
import { anthropicAcceptsSampling, buildAnthropicBody, extractAnthropicText, CACHE_SYSTEM_ABOVE_CHARS } from "../lib/llm/anthropic.ts";
import { isOpenAiReasoningModel } from "../lib/llm/openai-compatible.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Stub fetch: capture the request, answer like a chat completion. */
function stubFetch(captured: { url?: string; headers?: Record<string, string>; body?: Record<string, unknown> }) {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.url = String(url);
    captured.headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    captured.body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("normalizeOllamaUrl: bare server gains /v1; custom paths survive", () => {
  assert.equal(normalizeOllamaUrl("http://localhost:11434"), "http://localhost:11434/v1");
  assert.equal(normalizeOllamaUrl("http://localhost:11434/"), "http://localhost:11434/v1");
  assert.equal(normalizeOllamaUrl("http://box:11434/v1"), "http://box:11434/v1");
  assert.equal(normalizeOllamaUrl("https://tunnel.example/ollama/v1"), "https://tunnel.example/ollama/v1");
});

test("ollama: keyless — no authorization header, default localhost /v1", async () => {
  const cap: Parameters<typeof stubFetch>[0] = {};
  stubFetch(cap);
  const llm = getLlmProvider("ollama");
  const out = await llm.chatJSON<{ ok: boolean }>({ system: "s", user: "u", model: llm.models.extract });
  assert.deepEqual(out, { ok: true });
  assert.equal(cap.url, "http://localhost:11434/v1/chat/completions");
  assert.equal(cap.headers?.authorization, undefined, "keyless server gets no Bearer header");
});

test("ollama: a BYOK base URL routes the call to the user's server", async () => {
  const cap: Parameters<typeof stubFetch>[0] = {};
  stubFetch(cap);
  const llm = getLlmProvider("ollama", undefined, { baseUrl: "https://my-box.tail1234.ts.net" });
  await llm.chatJSON({ system: "s", user: "u", model: "llama3.1" });
  assert.equal(cap.url, "https://my-box.tail1234.ts.net/v1/chat/completions");
  assert.equal(cap.body?.model, "llama3.1");
});

test("key-billed providers still refuse to run without a key", async () => {
  const stash = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const llm = getLlmProvider("openai");
    await assert.rejects(() => llm.chatJSON({ system: "s", user: "u", model: "gpt-4o-mini" }), /API key not set/);
  } finally {
    if (stash !== undefined) process.env.OPENAI_API_KEY = stash;
  }
});

test("a key, when given anyway, rides along (authenticated ollama proxies)", async () => {
  const cap: Parameters<typeof stubFetch>[0] = {};
  stubFetch(cap);
  const llm = getLlmProvider("ollama", "proxy-token");
  await llm.chatJSON({ system: "s", user: "u", model: "llama3.1" });
  assert.equal(cap.headers?.authorization, "Bearer proxy-token");
});

// ---- OpenAI reasoning models: no temperature, max_completion_tokens ----

test("openai: reasoning models get max_completion_tokens and NO temperature", async () => {
  const cap: Parameters<typeof stubFetch>[0] = {};
  stubFetch(cap);
  const llm = getLlmProvider("openai", "sk-test");
  await llm.chatJSON({ system: "s", user: "u", model: "gpt-5-mini", maxTokens: 4096 });
  assert.equal("temperature" in (cap.body ?? {}), false, "reasoning model must not get temperature");
  assert.equal(cap.body?.max_completion_tokens, 4096);
  assert.equal("max_tokens" in (cap.body ?? {}), false);
});

test("openai: classic models keep temperature 0 + max_tokens", async () => {
  const cap: Parameters<typeof stubFetch>[0] = {};
  stubFetch(cap);
  const llm = getLlmProvider("openai", "sk-test");
  await llm.chatJSON({ system: "s", user: "u", model: "gpt-4o-mini" });
  assert.equal(cap.body?.temperature, 0);
  assert.equal(cap.body?.max_tokens, 2048);
});

test("isOpenAiReasoningModel: only the real OpenAI API, only reasoning families", () => {
  assert.equal(isOpenAiReasoningModel("openai", "o3-mini"), true);
  assert.equal(isOpenAiReasoningModel("openai", "o1"), true);
  assert.equal(isOpenAiReasoningModel("openai", "gpt-5"), true);
  assert.equal(isOpenAiReasoningModel("openai", "gpt-5.1-mini"), true);
  assert.equal(isOpenAiReasoningModel("openai", "gpt-4o-mini"), false);
  assert.equal(isOpenAiReasoningModel("openai", "gpt-4.1"), false);
  // OpenRouter normalizes params itself; Ollama takes the classic shape.
  assert.equal(isOpenAiReasoningModel("openrouter", "gpt-5"), false);
  assert.equal(isOpenAiReasoningModel("ollama", "gpt-5"), false);
});

// ---- Anthropic sampling-param removal (temperature 400 on newest models) ----

test("anthropic: newest models REJECT temperature — it must be omitted", () => {
  for (const m of [
    "claude-sonnet-5",     // our escalate default — the exact model the bug hit
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-fable-5",
    "claude-mythos-5",
    "claude-sonnet-4-7",   // hypothetical future 4.7+ — not in the 4.0–4.6 allowlist
  ]) {
    assert.equal(anthropicAcceptsSampling(m), false, `${m} should NOT get temperature`);
  }
});

test("anthropic: older models still accept temperature", () => {
  for (const m of [
    "claude-haiku-4-5",             // our extract/vision default
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",   // dated snapshot id
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-opus-4-0",
    "claude-opus-4-1-20250805",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
    "claude-2.1",
  ]) {
    assert.equal(anthropicAcceptsSampling(m), true, `${m} should keep temperature`);
  }
});

test("anthropic body: temperature included only for models that accept it", () => {
  const escalate = buildAnthropicBody({ system: "s", user: "u", model: "claude-sonnet-5", temperature: 0 });
  assert.equal("temperature" in escalate, false, "claude-sonnet-5 body must not carry temperature");
  assert.equal(escalate.model, "claude-sonnet-5");
  assert.equal(escalate.max_tokens, 2048);

  const extract = buildAnthropicBody({ system: "s", user: "u", model: "claude-haiku-4-5" });
  assert.equal(extract.temperature, 0, "claude-haiku-4-5 keeps the deterministic default");
});

test("anthropic body: thinking disabled on adaptive-default models, absent elsewhere", () => {
  // Sonnet 5 / Opus 4.7+ run ADAPTIVE thinking when `thinking` is omitted —
  // for JSON extraction we turn it off explicitly.
  const sonnet5 = buildAnthropicBody({ system: "s", user: "u", model: "claude-sonnet-5" });
  assert.deepEqual(sonnet5.thinking, { type: "disabled" });
  const opus48 = buildAnthropicBody({ system: "s", user: "u", model: "claude-opus-4-8" });
  assert.deepEqual(opus48.thinking, { type: "disabled" });
  // Older models: no thinking field at all (they never think by default).
  const haiku = buildAnthropicBody({ system: "s", user: "u", model: "claude-haiku-4-5" });
  assert.equal("thinking" in haiku, false);
  // Always-thinking families reject {type:"disabled"} — must stay omitted.
  const fable = buildAnthropicBody({ system: "s", user: "u", model: "claude-fable-5" });
  assert.equal("thinking" in fable, false);
});

test("anthropic: ANTHROPIC_BASE_URL reroutes the provider; thinking-first reply parses", async () => {
  const stash = process.env.ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9999";
  const cap: { url?: string; body?: Record<string, unknown> } = {};
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    cap.url = String(url);
    cap.body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"ok":true}' }], stop_reason: "end_turn" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const llm = getLlmProvider("anthropic", "sk-ant-test");
    const out = await llm.chatJSON<{ ok: boolean }>({ system: "s", user: "u", model: "claude-sonnet-5" });
    assert.deepEqual(out, { ok: true }, "thinking-first reply must still parse");
    assert.equal(cap.url, "http://127.0.0.1:9999/v1/messages");
    assert.equal("temperature" in (cap.body ?? {}), false);
    assert.deepEqual(cap.body?.thinking, { type: "disabled" });
  } finally {
    if (stash === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = stash;
  }
});

test("anthropic reply: text found even when thinking blocks come first", () => {
  // Thinking-on responses lead with thinking blocks (empty text under the
  // default display) — content[0].text is NOT the reply.
  assert.equal(
    extractAnthropicText({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"ok":1}' }] }),
    '{"ok":1}',
  );
  assert.equal(
    extractAnthropicText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }),
    "ab",
  );
  assert.equal(extractAnthropicText({ content: [{ type: "thinking", thinking: "x" }] }), "");
  assert.equal(extractAnthropicText({}), "");
  assert.equal(extractAnthropicText(null), "");
});

test("anthropic body: vision requests put image blocks before the text", () => {
  const body = buildAnthropicBody({
    system: "s", user: "describe", model: "claude-haiku-4-5",
    images: [{ mediaType: "image/png", dataBase64: "aGk=" }],
  });
  const content = (body.messages as Array<{ content: unknown }>)[0].content as Array<{ type: string }>;
  assert.deepEqual(content.map((c) => c.type), ["image", "text"]);
});

test("anthropic body: long stable system rides a cache_control block; short stays a string", () => {
  const long = buildAnthropicBody({ system: "r".repeat(CACHE_SYSTEM_ABOVE_CHARS), user: "u", model: "claude-haiku-4-5" });
  assert.deepEqual(long.system, [
    { type: "text", text: "r".repeat(CACHE_SYSTEM_ABOVE_CHARS), cache_control: { type: "ephemeral" } },
  ]);
  const short = buildAnthropicBody({ system: "small", user: "u", model: "claude-haiku-4-5" });
  assert.equal(short.system, "small"); // below the cacheable minimum — plain string
});
