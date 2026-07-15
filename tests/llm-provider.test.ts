// Unit tests for provider routing (lib/llm/index.ts) — the Ollama keyless
// path in particular: URL normalization, no auth header, key still required
// for key-billed providers. fetch is stubbed; nothing leaves the process.
// Run with: npm test

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getLlmProvider, normalizeOllamaUrl } from "../lib/llm/index.ts";

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
