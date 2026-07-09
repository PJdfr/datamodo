import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { aggregate, monthlySeries, factMetrics, listMeasures, type AggOp } from "@/lib/datamodo/analytics";

// Analytics over the knowledge layer's facts. Read-only aggregation, so it runs
// with the user's RLS client (their org's facts only).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(db, user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });
  const admin = createAdminClient();

  const body = (await req.json().catch(() => ({}))) as {
    op?: "aggregate" | "series" | "metrics" | "measures";
    measure?: string; groupBy?: string; kind?: string; date?: string; agg?: AggOp;
  };

  if (body.op === "metrics" || !body.op) {
    return NextResponse.json(await factMetrics(admin, org.id));
  }
  if (body.op === "measures") {
    return NextResponse.json(await listMeasures(admin, org.id));
  }
  if (body.op === "aggregate") {
    if (!body.measure) return NextResponse.json({ error: "measure required" }, { status: 400 });
    return NextResponse.json(await aggregate(admin, org.id, { measure: body.measure, op: body.agg, groupBy: body.groupBy, kind: body.kind }));
  }
  if (body.op === "series") {
    if (!body.measure || !body.date) return NextResponse.json({ error: "measure and date required" }, { status: 400 });
    return NextResponse.json(await monthlySeries(admin, org.id, { measure: body.measure, date: body.date, op: body.agg, kind: body.kind }));
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
