import { NextResponse } from "next/server";
import { isLocalMode, LOCAL_AI_PROVIDERS, type LocalAiProvider } from "@/lib/local/config";
import { readLocalLlmFile } from "@/lib/local/llm-config";
import { ollamaTags, DEFAULT_OLLAMA_URL } from "@/lib/local/setup.mjs";

// LOCAL-ONLY: probe an AI provider FROM THE DASHBOARD — "does this key work,
// which models can it use, does this model actually answer?" — so a non-dev
// never needs the terminal to debug their setup. Given a provider (+ a typed
// key that may not be saved yet, or the saved one), it:
//   1. validates reachability/credentials with the provider's FREE endpoint
//      (list-models — costs nothing),
//   2. returns the model ids the key can use (feeds the Settings dropdowns),
//   3. optionally fires ONE tiny real completion against a chosen model to
//      prove the whole path end-to-end (a few tokens; user-initiated only).
// Keys are used transiently and never stored here (saving stays with the
// Settings action). The cloud edition 404s this route.
export const runtime = "nodejs";
export const maxDuration = 60;

const notLocal = () => NextResponse.json({ error: "not found" }, { status: 404 });

interface ProbeResult {
  ok: boolean;
  error?: string;
  /** Models available to this key/server (dropdown fodder). */
  models?: string[];
  /** Set when a `model` was given: did a real completion come back? */
  modelOk?: boolean;
  latencyMs?: number;
}

const trimmed = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const PROVIDER_HOST: Record<LocalAiProvider, string> = {
  ollama: "the Ollama server",
  anthropic: "Anthropic (api.anthropic.com)",
  openai: "OpenAI (api.openai.com)",
  openrouter: "OpenRouter (openrouter.ai)",
};

async function listOpenAiStyle(base: string, key: string | undefined): Promise<string[]> {
  const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("The key was rejected — double-check it (and that it's an API key, not a chat subscription).");
  if (!res.ok) throw new Error(`The provider answered ${res.status}.`);
  const json = await res.json();
  return ((json.data ?? []) as { id?: string }[]).map((m) => m.id ?? "").filter(Boolean).sort();
}

/** One tiny real completion through the SAME provider stack extraction uses. */
async function tinyChat(provider: LocalAiProvider, key: string | undefined, baseUrl: string | undefined, model: string): Promise<number> {
  const { getLlmProvider } = await import("@/lib/llm");
  const llm = getLlmProvider(provider, provider === "ollama" ? undefined : key, {
    baseUrl: provider === "ollama" ? baseUrl : undefined,
    models: { extract: model, escalate: model, vision: model },
  });
  const t0 = Date.now();
  await llm.chatJSON<{ ok?: boolean }>({
    model,
    system: "You are a connectivity test. Reply with JSON only.",
    user: 'Reply with exactly {"ok":true}',
    maxTokens: 30,
    temperature: 0,
  });
  return Date.now() - t0;
}

export async function POST(req: Request) {
  if (!isLocalMode()) return notLocal();
  let body: { provider?: string; key?: string; url?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const provider = (LOCAL_AI_PROVIDERS as readonly string[]).includes(body.provider ?? "") ? (body.provider as LocalAiProvider) : "ollama";
  const model = trimmed(body.model);
  const out: ProbeResult = { ok: false };

  try {
    if (provider === "ollama") {
      const file = await readLocalLlmFile();
      const base = trimmed(body.url) ?? file.url ?? process.env.OLLAMA_BASE_URL?.trim() ?? DEFAULT_OLLAMA_URL;
      const tags = await ollamaTags(base);
      if (tags === null) {
        return NextResponse.json({ ok: false, error: `Ollama isn't reachable at ${base}. Open the Ollama app (or install it from ollama.com), then try again.` });
      }
      const list = tags.map((t: string) => t.replace(/:latest$/, "")).sort();
      out.models = list;
      out.ok = true;
      if (model) {
        const installed = list.includes(model.replace(/:latest$/, "")) || tags.includes(model);
        if (!installed) {
          return NextResponse.json({ ...out, modelOk: false, error: `"${model}" isn't downloaded yet — use the download button next to the model list.` });
        }
        out.latencyMs = await tinyChat("ollama", undefined, base, model);
        out.modelOk = true;
      }
    } else {
      // BYOK providers: the typed (unsaved) key wins; fall back to the saved
      // one ONLY when it belongs to this provider.
      let key = trimmed(body.key);
      if (!key) {
        const { getSessionUser } = await import("@/lib/auth/session");
        const user = await getSessionUser();
        if (user) {
          const { getSettings, getByokKey } = await import("@/lib/datamodo/settings");
          const settings = await getSettings(user.id);
          if (settings.aiProvider === provider) key = (await getByokKey(user.id)) ?? undefined;
        }
      }
      if (!key) return NextResponse.json({ ok: false, error: "Paste your API key first, then test." });

      if (provider === "anthropic") {
        const base = process.env.ANTHROPIC_BASE_URL?.trim() ?? "https://api.anthropic.com";
        const res = await fetch(`${base.replace(/\/$/, "")}/v1/models?limit=100`, {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 401 || res.status === 403) throw new Error("Anthropic rejected the key — check it on console.anthropic.com (it must be an API key, not your Claude subscription login).");
        if (!res.ok) throw new Error(`Anthropic answered ${res.status}.`);
        const json = await res.json();
        out.models = ((json.data ?? []) as { id?: string }[]).map((m) => m.id ?? "").filter(Boolean).sort();
      } else if (provider === "openai") {
        const base = process.env.OPENAI_BASE_URL?.trim() ?? "https://api.openai.com/v1";
        out.models = (await listOpenAiStyle(base, key)).filter((id) => !/^(whisper|tts|dall-e|text-embedding|omni-moderation|babbage|davinci)/.test(id));
      } else {
        const base = process.env.OPENROUTER_BASE_URL?.trim() ?? "https://openrouter.ai/api/v1";
        // /key validates the CREDENTIAL (models list is public on OpenRouter).
        const keyRes = await fetch(`${base.replace(/\/$/, "")}/key`, {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (keyRes.status === 401 || keyRes.status === 403) throw new Error("OpenRouter rejected the key — check it on openrouter.ai/keys.");
        if (!keyRes.ok) throw new Error(`OpenRouter answered ${keyRes.status}.`);
        out.models = await listOpenAiStyle(base, key);
      }
      out.ok = true;
      if (model) {
        out.latencyMs = await tinyChat(provider, key, undefined, model);
        out.modelOk = true;
      }
    }
    return NextResponse.json(out);
  } catch (e) {
    let msg = (e as Error)?.message ?? String(e);
    // Raw fetch errors read like stack traces — translate for humans.
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|aborted|timeout/i.test(msg)) {
      msg = `Couldn't reach ${provider === "ollama" ? "the Ollama server" : PROVIDER_HOST[provider]} — check your internet connection and try again.`;
    }
    // A failed MODEL test still reports the key/list success that preceded it.
    if (out.ok) return NextResponse.json({ ...out, modelOk: false, error: `The model didn't answer: ${msg}` });
    return NextResponse.json({ ok: false, error: msg });
  }
}
