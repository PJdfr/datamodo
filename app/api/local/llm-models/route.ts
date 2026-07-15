import { NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local/config";
import { readLocalLlmModels, writeLocalLlmModels } from "@/lib/local/llm-config";

// LOCAL-ONLY: read/write the per-user LLM model overrides (~/.datamodo/llm.json)
// so they can be set from the dashboard instead of env vars. Empty fields fall
// through to the env override, then the built-in default. The cloud edition
// configures models via env, so this 404s there.
export const runtime = "nodejs";

const notLocal = () => NextResponse.json({ error: "not found" }, { status: 404 });

export async function GET() {
  if (!isLocalMode()) return notLocal();
  return NextResponse.json({ models: await readLocalLlmModels() });
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
