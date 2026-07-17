import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { prisma } from "@/lib/prisma";
import { logRoutingEvent } from "@/lib/datamodo/routing";

// ADAPTIVE ROUTING feedback from the composer's suggestion chip. The client
// fires this on ✕-dismiss ("not this agent" — an explicit reject the nightly
// learning pass turns into negative term weights). Accepts ride the send
// itself (an addressed message is logged server-side in /api/chat), so this
// route mostly sees rejects; the verdict field stays open for future explicit
// signals. Session-authed; the event is best-effort garnish — a failure
// changes nothing for the user.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { agentId?: string; verdict?: string; text?: string }
    | null;
  const verdict = body?.verdict === "accept" ? "accept" : body?.verdict === "reject" ? "reject" : null;
  const text = (body?.text ?? "").trim();
  if (!body?.agentId || !verdict || !text) {
    return NextResponse.json({ error: "agentId, verdict and text required" }, { status: 400 });
  }
  const agent = await prisma.agents
    .findFirst({ where: { id: body.agentId, org_id: org.id }, select: { id: true } })
    .catch(() => null);
  if (!agent) return NextResponse.json({ error: "unknown agent" }, { status: 400 });

  const logged = await logRoutingEvent(org.id, {
    agentId: agent.id,
    verdict,
    source: verdict === "accept" ? "chip_accept" : "chip_dismiss",
    text,
  });
  return NextResponse.json({ logged });
}
