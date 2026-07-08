import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/channels/inbound";
import { parseWebhook, reply, verifySignature } from "@/lib/channels/slack";

// Slack Events API webhook. The first request is a url_verification challenge we
// must echo back; subsequent requests are signed message events.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = await parseWebhook(body);
  if (parsed.kind === "challenge") {
    return NextResponse.json({ challenge: parsed.challenge });
  }
  try {
    await handleInbound("slack", parsed.messages, reply);
  } catch (e) {
    console.error("[webhooks/slack] failed", e);
  }
  // Always 200 fast — Slack disables the subscription after repeated failures.
  return NextResponse.json({ ok: true });
}
