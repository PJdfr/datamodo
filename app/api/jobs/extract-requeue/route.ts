import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { EXTRACTION_VERSION } from "@/lib/datamodo/extract";

// DELTA REPROCESSING — the other half of the extraction_version stamp: after a
// material prompt/pipeline change, bump EXTRACTION_VERSION and hit this once.
// Every analyzed item stamped with an OLDER version (or none, pre-stamp
// history) flips back to 'stored', and the normal tick re-extracts it. The
// knowledge layer makes re-runs safe by construction: entity resolution
// dedupes, claim keys dedupe facts, contradictions supersede.
export const runtime = "nodejs";
export const maxDuration = 30;

// Same contract as extract-tick: `Authorization: Bearer <CRON_SECRET>`.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?below=N to requeue items stamped < N; defaults to the current version.
  const url = new URL(req.url);
  const raw = url.searchParams.get("below");
  const below = raw === null ? EXTRACTION_VERSION : Number(raw);
  if (!Number.isInteger(below) || below < 1) {
    return NextResponse.json({ error: "below must be a positive integer" }, { status: 400 });
  }

  const res = await prisma.items.updateMany({
    where: {
      status: "analyzed",
      OR: [{ extraction_version: { lt: below } }, { extraction_version: null }],
    },
    // Fresh attempts: the version bump is a new job, not a retry of the old one.
    data: { status: "stored", claimed_at: null, attempts: 0, error: null },
  });

  return NextResponse.json({ requeued: res.count, below, current: EXTRACTION_VERSION });
}
