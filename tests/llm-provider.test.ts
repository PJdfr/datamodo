// Unit tests for provider routing (lib/llm/index.ts) — the Ollama keyless
// path in particular: URL normalization, no auth header, key still required
// for key-billed providers. fetch is stubbed; nothing leaves the process.
// Run with: npm test

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getLlmProvider, normalizeOllamaUrl } from "../lib/llm/index.ts";
import { anthropicAcceptsSampling, buildAnthropicBody } from "../lib/llm/anthropic.ts";

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

test("anthropic body: vision requests put image blocks before the text", () => {
  const body = buildAnthropicBody({
    system: "s", user: "describe", model: "claude-haiku-4-5",
    images: [{ mediaType: "image/png", dataBase64: "aGk=" }],
  });
  const content = (body.messages as Array<{ content: unknown }>)[0].content as Array<{ type: string }>;
  assert.deepEqual(content.map((c) => c.type), ["image", "text"]);
});
