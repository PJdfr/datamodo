import { NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local/config";
import { readLocalLlmModels, writeLocalLlmModels } from "@/lib/local/llm-config";
import { ollamaTags, DEFAULT_OLLAMA_URL } from "@/lib/local/setup.mjs";

// LOCAL-ONLY: read/write the per-user LLM config (~/.datamodo/llm.json) — the
// Ollama server URL + which model handles text vs. vision — so it's all
// settable from the dashboard instead of env vars. Empty fields fall through
// to the env override, then the built-in default. GET also probes the
// effective Ollama server (fail-soft, short timeout) so Settings can show
// reachability + the locally installed models. The cloud edition configures
// models via env, so this 404s there.
export const runtime = "nodejs";

const notLocal = () => NextResponse.json({ error: "not found" }, { status: 404 });

/** The server the local compute would actually talk to right now —
 *  dashboard value → env → localhost (the app-wide precedence). */
function effectiveUrl(saved?: string): string {
  return saved ?? process.env.OLLAMA_BASE_URL?.trim() ?? DEFAULT_OLLAMA_URL;
}

export async function GET() {
  if (!isLocalMode()) return notLocal();
  const models = await readLocalLlmModels();
  const url = effectiveUrl(models.url);
  const tags = await ollamaTags(url);
  return NextResponse.json({
    models,
    ollama: { url, reachable: tags !== null, tags: tags ?? [] },
  });
}

export async function POST(req: Request) {
  if (!isLocalMode()) return notLocal();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const models = await writeLocalLlmModels((body as { models?: unknown })?.models ?? body);
  return NextResponse.json({ ok: true, models });
}
