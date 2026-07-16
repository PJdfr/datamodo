import { NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local/config";
import { readLocalLlmFile } from "@/lib/local/llm-config";
import { DEFAULT_OLLAMA_URL } from "@/lib/local/setup.mjs";

// LOCAL-ONLY: download an Ollama model FROM THE DASHBOARD — the terminal-free
// counterpart of `ollama pull` / `datamodo setup`. The route drives Ollama's
// streaming pull to completion and answers when the model is ready; the UI
// polls the installed-models list meanwhile for a live "downloading…" state.
// Local runs behind `next start` on the user's machine — no platform timeout —
// but big models take minutes, so the client should not await this call alone.
export const runtime = "nodejs";
export const maxDuration = 600;

const notLocal = () => NextResponse.json({ error: "not found" }, { status: 404 });

/** Ollama model names: letters/digits/dots/dashes/underscores/slash + :tag. */
const MODEL_RE = /^[\w.\-/]{1,80}(:[\w.\-]{1,40})?$/;

export async function POST(req: Request) {
  if (!isLocalMode()) return notLocal();
  let body: { model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const model = (body.model ?? "").trim();
  if (!MODEL_RE.test(model)) return NextResponse.json({ error: "that doesn't look like a model name" }, { status: 400 });

  const file = await readLocalLlmFile();
  const base = (file.url ?? process.env.OLLAMA_BASE_URL?.trim() ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, "").replace(/\/v1$/, "");

  const { ollamaPull } = await import("@/lib/local/setup.mjs");
  // Quiet logger: the CLI streams pull progress to the terminal; here the UI
  // polls the installed list instead, so server logs stay clean.
  const quiet = { log() {}, error() {} } as unknown as Console;
  const okPull = await ollamaPull(base, model, quiet);
  if (!okPull) {
    return NextResponse.json({ ok: false, error: `Could not download "${model}" — is Ollama running, and is the name right? (Popular ones: llama3.1:8b, llava, nomic-embed-text.)` });
  }
  return NextResponse.json({ ok: true, model });
}
