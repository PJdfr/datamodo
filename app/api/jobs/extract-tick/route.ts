import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { runExtractionForItem } from "@/lib/datamodo/extract";

// Extraction runs the LLM + Node built-ins and needs the service key.
export const runtime = "nodejs";
// Bound the tick so one slow batch can't run away (Vercel Pro allows up to 300s;
// 60s comfortably covers a small batch of LLM calls).
export const maxDuration = 60;

// How many jobs to drain per tick, and how long each stays invisible while we
// work on it. Kept small so LLM cost/concurrency stays bounded per invocation.
const BATCH = Number(process.env.EXTRACT_BATCH ?? 5);
const VISIBILITY_SECONDS = 120;
// After this many delivery attempts a job is treated as poison and archived
// (the item is already marked 'failed' with its error by runExtractionForItem).
const MAX_ATTEMPTS = 5;

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set
// in the project env. We accept that, and nothing else.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Job = { msg_id: number; read_ct: number; item_id: string };

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("extraction_read_batch", {
    p_qty: BATCH,
    p_vt: VISIBILITY_SECONDS,
  });
  if (error) {
    console.error("[extract-tick] read failed", error);
    return NextResponse.json({ error: "queue read failed" }, { status: 500 });
  }

  const jobs = (data ?? []) as Job[];
  let processed = 0;
  let failed = 0;
  let poisoned = 0;

  for (const job of jobs) {
    try {
      await runExtractionForItem(admin, job.item_id);
      await admin.rpc("extraction_archive", { p_msg_id: job.msg_id });
      processed++;
    } catch (e) {
      // runExtractionForItem already set items.status = 'failed' + error.
      // Give up on poison messages so they don't loop forever; otherwise leave
      // the message unacked so pgmq redelivers it after the visibility timeout.
      if (job.read_ct >= MAX_ATTEMPTS) {
        await admin.rpc("extraction_archive", { p_msg_id: job.msg_id });
        poisoned++;
        console.error(
          `[extract-tick] item ${job.item_id} poisoned after ${job.read_ct} attempts`,
          e,
        );
      } else {
        failed++;
        console.error(`[extract-tick] item ${job.item_id} failed (will retry)`, e);
      }
    }
  }

  return NextResponse.json({ read: jobs.length, processed, failed, poisoned });
}

// Vercel Cron issues GET by default on some plans; accept it too.
export const GET = POST;
