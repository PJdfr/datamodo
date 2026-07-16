import { NextResponse } from "next/server";
import { isLocalMode, LOCAL_AI_PROVIDERS, type LocalAiProvider } from "@/lib/local/config";
import { readLocalLlmFile, writeLocalLlmModels } from "@/lib/local/llm-config";
import { ollamaTags, DEFAULT_OLLAMA_URL, detectRamGb } from "@/lib/local/setup.mjs";
import { pickTier } from "@/lib/local/sizing.mjs";

// LOCAL-ONLY: read/write the per-user LLM config (~/.datamodo/llm.json) — the
// Ollama server URL + which model handles text vs. vision, stored PER PROVIDER
// (?provider=ollama|anthropic|openai|openrouter, default ollama) so the
// wizard's Ollama names never leak into a BYOK provider's requests. Empty
// fields fall through to the env override, then the built-in default. GET
// also probes the effective Ollama server (fail-soft, short timeout) when
// asked about ollama, so Settings can show reachability + installed models.
// The cloud edition configures models via env, so this 404s there.
export const runtime = "nodejs";

const notLocal = () => NextResponse.json({ error: "not found" }, { status: 404 });

function parseProvider(v: string | null): LocalAiProvider {
  return (LOCAL_AI_PROVIDERS as readonly string[]).includes(v ?? "") ? (v as LocalAiProvider) : "ollama";
}

/** The server local compute would actually talk to right now —
 *  dashboard value → env → localhost (the app-wide precedence). */
function effectiveUrl(saved?: string): string {
  return saved ?? process.env.OLLAMA_BASE_URL?.trim() ?? DEFAULT_OLLAMA_URL;
}

export async function GET(req: Request) {
  if (!isLocalMode()) return notLocal();
  const provider = parseProvider(new URL(req.url).searchParams.get("provider"));
  const file = await readLocalLlmFile();
  const models: Record<string, string | undefined> = { ...(file.providers[provider] ?? {}) };
  const url = effectiveUrl(file.url);
  const ollama = provider === "ollama" ? { url, reachable: false, tags: [] as string[] } : undefined;
  if (ollama) {
    const tags = await ollamaTags(url);
    ollama.reachable = tags !== null;
    ollama.tags = tags ?? [];
  }
  // `url` rides inside models for the Settings form (one save shape).
  if (provider === "ollama") models.url = file.url;
  // What the first-run wizard would pick for THIS machine — Settings offers
  // the same as one-click downloads (terminal-free `datamodo setup`).
  let recommended: { ramGb: number; tier: string; text: string; vision: string | null; embed: string } | undefined;
  if (provider === "ollama") {
    const ramGb = await detectRamGb().catch(() => 0);
    const tier = pickTier(ramGb);
    recommended = { ramGb, tier: tier.name, text: tier.text, vision: tier.vision, embed: tier.embed };
  }
  return NextResponse.json({ provider, models, ...(ollama ? { ollama } : {}), ...(recommended ? { recommended } : {}) });
}

export async function POST(req: Request) {
  if (!isLocalMode()) return notLocal();
  let body: { provider?: string; models?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const provider = parseProvider(body?.provider ?? null);
  const models = body?.models ?? (body as Record<string, unknown>);
  // Only the ollama form carries the server URL; other providers must not
  // clear it as a side effect.
  const file = await writeLocalLlmModels(provider, models, provider === "ollama" ? (models as { url?: unknown })?.url : undefined);
  return NextResponse.json({ ok: true, provider, models: file.providers[provider] ?? {}, url: file.url });
}
