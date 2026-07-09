import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { aggregate, monthlySeries, factMetrics, listMeasures, type AggOp } from "@/lib/datamodo/analytics";

// Analytics over the knowledge layer's facts. Read-only aggregation, so it runs
// with the user's RLS client (their org's facts only).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    op?: "aggregate" | "series" | "metrics" | "measures";
    measure?: string; groupBy?: string; kind?: string; date?: string; agg?: AggOp;
  };

  if (body.op === "metrics" || !body.op) {
    return NextResponse.json(await factMetrics(org.id));
  }
  if (body.op === "measures") {
    return NextResponse.json(await listMeasures(org.id));
  }
  if (body.op === "aggregate") {
    if (!body.measure) return NextResponse.json({ error: "measure required" }, { status: 400 });
    return NextResponse.json(await aggregate(org.id, { measure: body.measure, op: body.agg, groupBy: body.groupBy, kind: body.kind }));
  }
  if (body.op === "series") {
    if (!body.measure || !body.date) return NextResponse.json({ error: "measure and date required" }, { status: 400 });
    return NextResponse.json(await monthlySeries(org.id, { measure: body.measure, date: body.date, op: body.agg, kind: body.kind }));
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
