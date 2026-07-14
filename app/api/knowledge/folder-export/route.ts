import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKnowledge } from "@/lib/datamodo/knowledge";
import { readBlob } from "@/lib/ingest/store";
import { buildZip, type ZipEntry } from "@/lib/datamodo/zip";
import {
  collectExportables,
  parseFolderPlan,
  planFiles,
  renderFolderReadme,
  renderNodeMarkdown,
  type FolderPlan,
} from "@/lib/datamodo/folder-export";

// Folder-tree export — the Files view's lens tree (folders derived
// DETERMINISTICALLY from the graph — no LLM) downloads as a .zip:
// { plan: { name, placements }, download: true } → true documents carry
// their ORIGINAL file (from blob storage, fail-soft to a markdown note when
// unavailable), every other node exports as markdown, plus a README
// describing the tree. The plan is re-sanitized server-side
// (traversal-proof paths, unknown ids dropped, unplaced → unsorted/); a doc
// may appear in several folders — folders are tags.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { plan?: FolderPlan; download?: boolean }
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

  if (!body.download) return NextResponse.json({ error: "bad request" }, { status: 400 });

  {
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
}
