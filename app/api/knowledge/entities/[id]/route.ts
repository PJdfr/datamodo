import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";

// Curate one entity's presentation. Today that is the graph pin: the node's
// user-chosen canvas position ({x,y} normalized 0..1) or null for auto layout.
// Facts and labels are NOT editable here — knowledge changes go through
// extraction + review, never a direct write.
export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { graphPin?: { x?: unknown; y?: unknown } | null } | null;
  if (!body || !("graphPin" in body)) return NextResponse.json({ error: "graphPin required" }, { status: 400 });

  let pin: { x: number; y: number } | null = null;
  if (body.graphPin !== null) {
    const { x, y } = body.graphPin ?? {};
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ error: "graphPin must be {x,y} numbers or null" }, { status: 400 });
    }
    pin = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  const updated = await prisma.entities.updateMany({
    where: { id, org_id: org.id, merged_into: null },
    // Nullable Json columns need the DbNull sentinel to write SQL NULL.
    data: { graph_pin: pin === null ? Prisma.DbNull : pin, updated_at: new Date() },
  });
  if (updated.count === 0) return NextResponse.json({ error: "entity not found" }, { status: 404 });
  return NextResponse.json({ ok: true, graphPin: pin });
}
