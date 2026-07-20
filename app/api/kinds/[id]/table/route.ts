import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { materializeKindTable } from "@/lib/datamodo/datasets";

// One-click "category → table": the template IS the schema. The whole flow
// (build columns from the category's fields + relation verbs, create-or-adopt
// the dataset, bind kind_id, project every entity of that kind) lives in
// materializeKindTable so the MCP server shares the exact same path.
export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  try {
    const result = await materializeKindTable(org.id, user.id, id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const status = msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
