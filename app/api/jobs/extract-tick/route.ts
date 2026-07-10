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
  // poison items), then claim a batch atomically (stored → analyzing, SKIP
  // LOCKED) and extract.
  const recovered = await recoverExtractionQueue();
  const ids = await claimStoredItems(BATCH);
  let processed = 0;
  let failed = 0;
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

  return NextResponse.json({ claimed: ids.length, processed, failed, ...recovered });
}

export const POST = handle;
export const GET = handle;
