import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ingest, IngestError } from "@/lib/ingest/store";
import type { IngestEnvelope } from "@/lib/ingest/types";

// The capture core needs Node built-ins (crypto, zlib) and the service key.
export const runtime = "nodejs";
// The post-response extraction kick (below) runs LLM calls inside this route's
// lifetime; give it room beyond the capture itself.
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_WEBHOOK_SECRET;
  const provided = req.headers.get("x-ingest-secret") ?? "";
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Generic, provider-independent ingestion endpoint. Provider adapters
// (email/whatsapp/…) normalize their payloads into an IngestEnvelope and POST
// it here with the shared secret.
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let env: IngestEnvelope;
  try {
    env = (await req.json()) as IngestEnvelope;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const result = await ingest(env);
    // Kick extraction NOW, after the response is sent, instead of waiting for
    // the cron sweep (GitHub's scheduler can lag hours on a quiet repo). The
    // claim is atomic (SKIP LOCKED), so racing a concurrent cron tick is safe;
    // the cron remains the sweeper for retries and anything missed here.
    if (!result.deduped) {
      after(async () => {
        try {
          const { claimStoredItems, runExtractionForItem } = await import("@/lib/datamodo/extract");
          const ids = await claimStoredItems(3);
          for (const id of ids) {
            try {
              await runExtractionForItem(id);
            } catch (err) {
              console.error(`[ingest] post-capture extraction failed for ${id}`, err);
            }
          }
        } catch (err) {
          console.error("[ingest] post-capture extraction kick failed", err);
        }
      });
    }
    return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
  } catch (e) {
    if (e instanceof IngestError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    console.error("[ingest] failed", e);
    return NextResponse.json({ error: "ingestion failed" }, { status: 500 });
  }
}
