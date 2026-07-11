import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";

// The extraction queue's depth for the signed-in user — powers the dashboard's
// "⟳ processing N items" pill (requeue UX: after a version-bump requeue, the
// user can SEE the backlog drain instead of wondering). Session-authed and
// org-scoped, unlike the CRON_SECRET-gated tick/requeue endpoints.
export const runtime = "nodejs";

// Matches MAX_ATTEMPTS in lib/datamodo/extract.ts: failed items under the cap
// still get retried by the recovery pass, so they count as queued, not stuck.
const MAX_ATTEMPTS = 3;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ queued: 0, analyzing: 0, stuck: 0 });

  const [stored, analyzing, retryable, stuck] = await Promise.all([
    prisma.items.count({ where: { org_id: org.id, status: "stored" } }),
    prisma.items.count({ where: { org_id: org.id, status: "analyzing" } }),
    prisma.items.count({ where: { org_id: org.id, status: "failed", attempts: { lt: MAX_ATTEMPTS } } }),
    prisma.items.count({ where: { org_id: org.id, status: "failed", attempts: { gte: MAX_ATTEMPTS } } }),
  ]);
  return NextResponse.json({ queued: stored + retryable, analyzing, stuck });
}
