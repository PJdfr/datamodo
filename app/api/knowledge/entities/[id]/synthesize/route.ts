import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKnowledge } from "@/lib/datamodo/knowledge";
import { llmForUser } from "@/lib/datamodo/llm-for-user";
import {
  buildSynthesisPrompt,
  collectSynthesisSources,
  renderSynthesisBody,
} from "@/lib/datamodo/synthesis";

// "✦ Synthesize" — the ON-DEMAND generation seam (north star: LLM spend maps
// 1:1 to user curiosity; nothing here ever runs from a background trigger).
// POST = the user asked: gather the entity's connected content, have the LLM
// write ONE cited note from those sources only, stamp our deterministic
// Sources footer, store it as the entity's body_md. Fails soft: no key / a
// flaky model returns a friendly error, never a broken page.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const entities = await listKnowledge(org.id);
  const entity = entities.find((e) => e.id === id);
  if (!entity) return NextResponse.json({ error: "entity not found" }, { status: 404 });

  const sources = collectSynthesisSources(entity, entities);
  if (sources.length < 2) {
    return NextResponse.json(
      { error: "not enough connected content to synthesize — needs at least two sources" },
      { status: 400 },
    );
  }

  const { system, user: userPrompt } = buildSynthesisPrompt(entity, sources);
  let noteMd: string;
  try {
    const llm = await llmForUser(user.id);
    // The stronger model: synthesis is a rare, user-initiated quality moment.
    const out = await llm.chatJSON<{ note_md?: string }>({
      system,
      user: userPrompt,
      model: llm.models.escalate,
      maxTokens: 1200,
      temperature: 0.3,
    });
    noteMd = (out.note_md ?? "").trim();
    if (!noteMd) throw new Error("empty note");
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const friendly = msg.includes("key")
      ? "no LLM key configured — add one in Settings (BYOK) or set the platform key"
      : "the model couldn't produce a note — try again";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  const bodyMd = renderSynthesisBody(noteMd, sources, new Date().toISOString().slice(0, 10));
  const updated = await prisma.entities.updateMany({
    where: { id, org_id: org.id, merged_into: null },
    data: { body_md: bodyMd, updated_at: new Date() },
  });
  if (updated.count === 0) return NextResponse.json({ error: "entity not found" }, { status: 404 });
  return NextResponse.json({ bodyMd, sources: sources.map((s) => ({ n: s.n, id: s.id, label: s.label })) });
}
