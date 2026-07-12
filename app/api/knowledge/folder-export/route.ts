import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKnowledge } from "@/lib/datamodo/knowledge";
import { readBlob } from "@/lib/ingest/store";
import { llmForUser } from "@/lib/datamodo/llm-for-user";
import { buildZip, type ZipEntry } from "@/lib/datamodo/zip";
import {
  buildFolderPrompt,
  collectExportables,
  parseFolderPlan,
  planFiles,
  renderFolderReadme,
  renderNodeMarkdown,
  type FolderPlan,
} from "@/lib/datamodo/folder-export";

// "Export as folders" — a folder structure BUILT FROM THE GRAPH, preview/
// confirm, on-demand only.
// { prompt } → the LLM organizes an INVENTORY of exportable nodes (documents
//   + body nodes; labels/kinds/links only, never contents) into a folder
//   plan; we return the resolved tree for preview. Nothing is generated yet.
// { plan, download: true } → the previewed plan becomes a .zip: true
//   documents carry their ORIGINAL file (from blob storage, fail-soft to a
//   markdown note when unavailable), every other node exports as markdown,
//   plus a README describing the tree.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { prompt?: string; plan?: FolderPlan; download?: boolean }
    | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const entities = await listKnowledge(org.id);
  const nodes = collectExportables(entities);
  if (nodes.length === 0) {
    return NextResponse.json(
      { error: "nothing to export yet — documents and notes appear here once your agents read messages" },
      { status: 400 },
    );
  }

  // --- download: the previewed plan (re-sanitized) becomes a zip -----------
  if (body.download) {
    const plan = parseFolderPlan(body.plan, nodes);
    const files = planFiles(plan, nodes);
    const byId = new Map(entities.map((e) => [e.id, e]));
    const labelOf = (id: string) => byId.get(id)?.label ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const enc = new TextEncoder();

    const entries: ZipEntry[] = [
      { path: "README.md", data: enc.encode(renderFolderReadme(plan, files, today)) },
    ];
    for (const f of files) {
      const e = byId.get(f.entityId);
      if (!e) continue;
      if (f.mode === "original") {
        const hash = /^doc:([^:]+):/.exec(e.naturalKeys?.id ?? "")?.[1];
        if (hash) {
          try {
            const bytes = await readBlob(org.id, hash);
            entries.push({ path: f.path, data: new Uint8Array(bytes) });
            continue;
          } catch {
            /* blob missing / bucket not provisioned — fall through to markdown */
          }
        }
        // Fail-soft: the node's page instead of a hole in the folder.
        entries.push({ path: `${f.path}.md`, data: enc.encode(renderNodeMarkdown(e, labelOf, today)) });
      } else {
        entries.push({ path: f.path, data: enc.encode(renderNodeMarkdown(e, labelOf, today)) });
      }
    }

    const zip = buildZip(entries, new Date());
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.length),
        "Content-Disposition": `attachment; filename="${plan.name}.zip"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  }

  // --- preview: prompt → plan → resolved tree, nothing generated -----------
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "describe how you want things organized" }, { status: 400 });

  let raw: unknown;
  try {
    const llm = await llmForUser(user.id);
    const { system, user: userPrompt } = buildFolderPrompt(prompt, nodes);
    // The stronger model — a rare, user-initiated design moment.
    raw = await llm.chatJSON<unknown>({ system, user: userPrompt, model: llm.models.escalate, maxTokens: 2400, temperature: 0 });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const friendly = msg.includes("key")
      ? "no LLM key configured — add one in Settings (BYOK) or set the platform key"
      : "the model couldn't design a structure — try rewording the request";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  const plan = parseFolderPlan(raw, nodes);
  const files = planFiles(plan, nodes);
  return NextResponse.json({
    plan,
    files: files.map((f) => ({ path: f.path, label: f.label, mode: f.mode })),
    total: files.length,
  });
}
