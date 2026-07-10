import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { getEntityTimeline } from "@/lib/datamodo/knowledge";

// One entity's history as a chronological event stream (asserted / changed /
// retracted facts + the messages they arrived on). Org-scoped, read-only.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const entityId = new URL(req.url).searchParams.get("entity");
  if (!entityId) return NextResponse.json({ error: "entity required" }, { status: 400 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ events: [] });
  const events = await getEntityTimeline(org.id, entityId);
  return NextResponse.json({ events });
}
