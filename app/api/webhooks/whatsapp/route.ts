import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/channels/inbound";
import { parseWebhook, reply, verifySignature, verifySubscription } from "@/lib/channels/whatsapp";

// WhatsApp Cloud API webhook. GET is Meta's subscription handshake; POST is the
// signed message delivery. Media downloads + capture happen inline; for high
// volume, move the parse+ingest behind a queue and 200 immediately (see README).
export const runtime = "nodejs";

export async function GET(req: Request) {
  const res = verifySubscription(new URL(req.url));
  if (res.ok) return new NextResponse(res.challenge, { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const messages = await parseWebhook(body);
    await handleInbound("whatsapp", messages, reply);
  } catch (e) {
    console.error("[webhooks/whatsapp] failed", e);
    // 200 anyway: Meta retries aggressively on non-2xx and would replay the batch.
  }
  return NextResponse.json({ ok: true });
}
