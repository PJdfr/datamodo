import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { updateKind, deleteKind, type KindInput } from "@/lib/datamodo/kinds";

// Edit or remove one category. The slug is identity (entities.kind points at
// it) so PATCH edits label/template/aliases, never the slug itself.
export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });
  const input = (await req.json().catch(() => null)) as KindInput | null;
  if (!input?.label?.trim()) return NextResponse.json({ error: "label required" }, { status: 400 });
  try {
    const kind = await updateKind(org.id, id, input);
    return NextResponse.json({ kind });
  } catch {
    return NextResponse.json({ error: "category not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });
  try {
    await deleteKind(org.id, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "category not found" }, { status: 404 });
  }
}
