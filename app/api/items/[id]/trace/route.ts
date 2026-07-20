import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { devTraceEnabled } from "@/lib/datamodo/trace";

// DEV TRACE read side: the full pipeline story of ONE item (recorded by
// runExtractionForItem when dev mode is on — see lib/datamodo/trace.ts).
// Session-authed + org-scoped like every other read; the trace is only ever
// the owner's own data (their message, their prompts, their graph).
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const item = await prisma.items.findFirst({
    where: { id, org_id: org.id },
    select: { id: true, channel: true, sender: true, subject: true, status: true, received_at: true, meta: true },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const trace = (item.meta as { dev_trace?: unknown } | null)?.dev_trace ?? null;
  return NextResponse.json({
    enabled: devTraceEnabled(),
    item: {
      id: item.id,
      channel: item.channel,
      sender: item.sender,
      subject: item.subject,
      status: item.status,
      receivedAt: item.received_at?.toISOString() ?? null,
    },
    trace,
  });
}
