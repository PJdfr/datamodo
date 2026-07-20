import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { buildCommitLog, buildTimeline, type BuildTimelineOptions } from "@/lib/datamodo/timeline";
import { fetchTimelineInputs } from "@/lib/datamodo/timeline-load";

// The chronological projection of the knowledge vault. Read-only, org-scoped.
// ?entity=<id> narrows to one entity's history; global otherwise. The event
// derivation itself is pure (lib/datamodo/timeline.ts); row fetching + shape
// adaptation live in lib/datamodo/timeline-load.ts (shared with the MCP).
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ events: [], commits: [] });
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entity");
  const { entityInputs, factInputs, itemInputs } = await fetchTimelineInputs(org.id);

  // ?view=commits — the git-style history (Review → Commits): one commit per
  // extraction run, facts as the diff. Same inputs, different pure projection.
  if (url.searchParams.get("view") === "commits") {
    const commits = buildCommitLog(entityInputs, factInputs, itemInputs, { entityId: entityId || null });
    return NextResponse.json({ commits });
  }

  // ?basis=sent puts messages at the moment they were SENT (forwarded email
  // carries the original date) instead of when they reached the inbox.
  const timeBasis = url.searchParams.get("basis") === "sent" ? ("sent" as const) : ("received" as const);
  const opts: BuildTimelineOptions = { entityId: entityId || null, timeBasis };
  const events = buildTimeline(entityInputs, factInputs, itemInputs, opts);
  return NextResponse.json({ events });
}
