import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { claimStoredItems, recoverExtractionQueue, runExtractionForItem } from "@/lib/datamodo/extract";

// Extraction runs the LLM + Node built-ins.
export const runtime = "nodejs";
// Bound one tick so it never overlaps the next cron run (Vercel Pro allows 300s;
// 60s comfortably covers a small batch of LLM calls).
export const maxDuration = 60;

const BATCH = Number(process.env.EXTRACT_BATCH ?? 3);

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

  // Recover the queue (requeue crashed-tick orphans + retryable failures, cap
  // poison items), then DRAIN: keep claiming batches (stored → analyzing, SKIP
  // LOCKED) while there's time budget left, so a backlog clears at LLM speed
  // instead of EXTRACT_BATCH per 5-minute cron.
  const recovered = await recoverExtractionQueue();
  const startedAt = Date.now();
  // Claim another batch only while a worst-case batch (~30s of LLM calls)
  // still fits inside maxDuration.
  const CLAIM_CUTOFF_MS = 25_000;
  let claimed = 0;
  let processed = 0;
  let failed = 0;
  while (Date.now() - startedAt < CLAIM_CUTOFF_MS) {
    const ids = await claimStoredItems(BATCH);
    if (ids.length === 0) break;
    claimed += ids.length;
    for (const id of ids) {
      try {
        await runExtractionForItem(id);
        processed++;
      } catch (e) {
        // runExtractionForItem already set items.status = 'failed' + error.
        failed++;
        console.error(`[extract-tick] item ${id} failed`, e);
      }
    }
  }

  return NextResponse.json({ claimed, processed, failed, ...recovered });
}

export const POST = handle;
export const GET = handle;
