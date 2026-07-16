import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKnowledge, touchEntities } from "@/lib/datamodo/knowledge";
import { buildDossier, dossierFilename } from "@/lib/datamodo/dossier";

// Download an entity's DOSSIER: its page + 1-hop neighborhood as cited
// markdown ("everything we know about Acme, and where each claim came from").
// Pure projection over listKnowledge — org-scoped, read-only.
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const entities = await listKnowledge(org.id);
  const target = entities.find((e) => e.id === id);
  const md = buildDossier(entities, id, new Date().toISOString().slice(0, 10));
  if (!target || !md) return NextResponse.json({ error: "entity not found" }, { status: 404 });
  // Downloading a dossier is the clearest "I still use this" signal there is.
  await touchEntities(org.id, [id]);

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dossierFilename(target.label)}"`,
      "Cache-Control": "no-store",
    },
  });
}
