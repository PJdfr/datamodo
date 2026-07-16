import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { consolidateOrg, orgsWithEntities } from "@/lib/datamodo/consolidate";
import { llmForUser } from "@/lib/datamodo/llm-for-user";
import { prisma } from "@/lib/prisma";

// BACKGROUND CONSOLIDATION tick (GRAPH_PIPELINE.md P1) — the graph's
// homeostasis pass: merge sweep + orphan flagging + embedding backfill.
// Designed for a slow cadence (daily cron); budget-capped per org so one
// tick is cheap, and idempotent so overlapping or dying ticks are harmless.
export const runtime = "nodejs";
export const maxDuration = 60;

const ORGS_PER_TICK = Number(process.env.CONSOLIDATE_ORGS ?? 25);
// Stop starting new orgs while a worst-case org (a dozen adjudication calls)
// still fits in maxDuration.
const CUTOFF_MS = 35_000;

// Called by the GitHub Actions cron with `Authorization: Bearer <CRON_SECRET>`.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const orgs = await orgsWithEntities(ORGS_PER_TICK);
  const results: Record<string, unknown>[] = [];
  for (const orgId of orgs) {
    if (Date.now() - startedAt > CUTOFF_MS) break;
    try {
      // Adjudication runs on the org owner's provider (BYOK when configured).
      // Fail-soft: no key / cap reached → propose-only mode, never a stop.
      const owner = await prisma.entities
        .findFirst({ where: { org_id: orgId, owner_user_id: { not: null } }, select: { owner_user_id: true } })
        .then((r) => r?.owner_user_id ?? null)
        .catch(() => null);
      const llm = await llmForUser(owner).catch(() => null);
      const stats = await consolidateOrg(orgId, llm);
      results.push({ orgId, ...stats });
    } catch (e) {
      console.error(`[consolidate] org ${orgId} failed`, e);
      results.push({ orgId, error: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }
  return NextResponse.json({ orgs: results.length, results });
}

export const POST = handle;
export const GET = handle;
