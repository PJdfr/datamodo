import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKnowledge } from "@/lib/datamodo/knowledge";
import { createDataset, ensureBaseline } from "@/lib/datamodo/datasets";
import { llmForUser } from "@/lib/datamodo/llm-for-user";
import {
  buildDeriveTablePrompt,
  buildDerivedTable,
  parseDeriveSpec,
  summarizeGraph,
  type DeriveTableSpec,
} from "@/lib/datamodo/derive-table";

// "Derive a table from your graph" — preview/confirm, on-demand only.
// { prompt } → the LLM designs a spec from the graph's SCHEMA (kinds +
//   predicates, never row data); we build the rows deterministically and
//   return them for preview. NOTHING is written.
// { spec, confirm: true } → the previewed spec (re-validated against the
//   live graph) becomes a real dataset with accepted rows, each row linked
//   to the entity it came from (rows are projections of the vault).
export const runtime = "nodejs";
export const maxDuration = 60;

const PREVIEW_ROWS = 12;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { prompt?: string; spec?: DeriveTableSpec; confirm?: boolean }
    | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const entities = await listKnowledge(org.id);
  if (entities.length === 0) {
    return NextResponse.json({ error: "no knowledge yet — forward some messages first" }, { status: 400 });
  }
  const summary = summarizeGraph(entities);

  // --- confirm: materialize the previewed spec -----------------------------
  if (body.confirm) {
    const parsed = parseDeriveSpec(body.spec, summary);
    if (!parsed.spec) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { spec } = parsed;
    const table = buildDerivedTable(entities, spec);
    const ds = await createDataset(org.id, "derive", {
      name: spec.name,
      description: spec.description || `Derived from your graph: ${spec.kind} + connections`,
      columns: table.columns,
    });
    if (table.rows.length) {
      await prisma.dataset_rows.createMany({
        data: table.rows.map((r) => ({
          org_id: org.id,
          dataset_id: ds.id,
          status: "accepted",
          origin: "agent",
          created_by: "derive",
          subject_entity_id: r.entityId,
          data: r.data as Prisma.InputJsonValue,
        })),
      });
    }
    await ensureBaseline(ds.id);
    return NextResponse.json({ datasetId: ds.id, name: ds.name, rows: table.rows.length });
  }

  // --- preview: prompt → spec → deterministic rows, nothing written --------
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "describe the table you want" }, { status: 400 });

  let raw: unknown;
  try {
    const llm = await llmForUser(user.id);
    const { system, user: userPrompt } = buildDeriveTablePrompt(prompt, summary);
    // The stronger model: a rare, user-initiated design moment (same call
    // shape as synthesis — LLM spend maps 1:1 to user curiosity).
    raw = await llm.chatJSON<unknown>({ system, user: userPrompt, model: llm.models.escalate, maxTokens: 1200, temperature: 0 });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const friendly = msg.includes("key")
      ? "no LLM key configured — add one in Settings (BYOK) or set the platform key"
      : "the model couldn't design a table — try rewording the request";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  const parsed = parseDeriveSpec(raw, summary);
  if (!parsed.spec) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const table = buildDerivedTable(entities, parsed.spec);
  return NextResponse.json({
    spec: parsed.spec,
    columns: table.columns,
    rows: table.rows.slice(0, PREVIEW_ROWS).map((r) => r.data),
    total: table.rows.length,
  });
}
