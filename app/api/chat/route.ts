import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { prisma } from "@/lib/prisma";
import { ingest, IngestError } from "@/lib/ingest/store";
import type { IngestAttachment } from "@/lib/ingest/types";

// THE APP IS A CHANNEL — the dashboard chat is just another adapter into the
// same capture core as email/WhatsApp/Slack: text, photos, PDFs, documents
// and voice notes all land as `upload`-channel items and ride the normal
// pipeline (attachments → document entities, images → vision tier, audio →
// transcription tier). Session-authed, org attributed explicitly — no shared
// secret, no link codes.
export const runtime = "nodejs";
// The post-response extraction kick runs LLM calls in this route's lifetime.
export const maxDuration = 60;

const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // matches what channels realistically carry
const MAX_ATTACHMENTS = 8;

/** GET — the chat thread: this org's in-app items, oldest first. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ messages: [] });

  const items = await prisma.items.findMany({
    where: { org_id: org.id, channel: "upload", meta: { path: ["via"], equals: "app" } },
    orderBy: { received_at: "desc" },
    take: 50,
    select: { id: true, body_preview: true, status: true, error: true, received_at: true },
  });
  const ids = items.map((i) => i.id);
  const atts = ids.length
    ? await prisma.attachments.findMany({
        where: { item_id: { in: ids } },
        select: { item_id: true, filename: true, content_type: true, bytes: true },
      })
    : [];
  const byItem = new Map<string, { filename: string | null; contentType: string | null; bytes: number }[]>();
  for (const a of atts) {
    if (!byItem.has(a.item_id)) byItem.set(a.item_id, []);
    byItem.get(a.item_id)!.push({ filename: a.filename, contentType: a.content_type, bytes: Number(a.bytes ?? 0) });
  }
  return NextResponse.json({
    messages: items.reverse().map((i) => ({
      id: i.id,
      text: i.body_preview,
      status: i.status,
      error: i.error,
      at: i.received_at.toISOString(),
      attachments: byItem.get(i.id) ?? [],
    })),
  });
}

/** POST — send a message (text and/or attachments) into the pipeline. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { text?: string; attachments?: IngestAttachment[] }
    | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const text = (body.text ?? "").trim();
  const attachments = (body.attachments ?? [])
    .filter((a) => a && typeof a.dataBase64 === "string" && a.dataBase64.length > 0)
    .slice(0, MAX_ATTACHMENTS);
  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: "say something or attach something" }, { status: 400 });
  }
  const totalBytes = attachments.reduce((n, a) => n + Math.floor(a.dataBase64.length * 0.75), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "attachments too large — 15 MB max per message" }, { status: 413 });
  }

  try {
    const result = await ingest({
      channel: "upload",
      captureMode: "active",
      orgId: org.id,
      ownerUserId: user.id,
      sender: user.email || "you",
      bodyText: text || undefined,
      attachments: attachments.length ? attachments : undefined,
      meta: { via: "app" },
    });
    // Same post-response extraction kick as /api/ingest — chat should feel
    // live, not wait for the cron sweep.
    if (!result.deduped) {
      after(async () => {
        try {
          const { claimStoredItems, runExtractionForItem } = await import("@/lib/datamodo/extract");
          const ids = await claimStoredItems(3);
          for (const id of ids) {
            try {
              await runExtractionForItem(id);
            } catch (err) {
              console.error(`[chat] post-capture extraction failed for ${id}`, err);
            }
          }
        } catch (err) {
          console.error("[chat] post-capture extraction kick failed", err);
        }
      });
    }
    return NextResponse.json({ itemId: result.itemId }, { status: 201 });
  } catch (e) {
    if (e instanceof IngestError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    console.error("[chat] ingest failed", e);
    return NextResponse.json({ error: "could not send" }, { status: 500 });
  }
}
