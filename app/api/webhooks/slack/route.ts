import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingest } from "@/lib/ingest/store";
import { isHandleBound, redeemChannelLinkCode } from "@/lib/datamodo/channels";
import type { IngestAttachment, IngestEnvelope } from "@/lib/ingest/types";

// Slack inbound adapter (Events API). One shared Slack app serves every user;
// we identify the user by their Slack user id (event.user), bound once via a
// link code they DM to the bot (see lib/datamodo/channels.ts).
export const runtime = "nodejs";

const MAX_SKEW_SECONDS = 300; // reject stale requests (replay protection)

/**
 * Slack request signature: X-Slack-Signature = "v0=" + hex HMAC-SHA256 over
 * `v0:{timestamp}:{rawBody}`, keyed by the app signing secret.
 * https://docs.slack.dev/authentication/verifying-requests-from-slack/
 */
function validSignature(raw: string, ts: string, header: string, secret: string): boolean {
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!ts || Number.isNaN(skew) || skew > MAX_SKEW_SECONDS) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${raw}`, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface SlackFile {
  name?: string;
  mimetype?: string;
  url_private?: string;
}
interface SlackEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts?: string;
  client_msg_id?: string;
  files?: SlackFile[];
}

/** Download a Slack private file (needs the bot token) as an attachment. */
async function fetchFile(f: SlackFile): Promise<IngestAttachment | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !f.url_private) return null;
  const res = await fetch(f.url_private, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { filename: f.name, contentType: f.mimetype, dataBase64: buf.toString("base64") };
}

export async function POST(req: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    console.error("[slack] SLACK_SIGNING_SECRET not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const raw = await req.text();
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  const sig = req.headers.get("x-slack-signature") ?? "";
  if (!validSignature(raw, ts, sig, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  let payload: {
    type?: string;
    challenge?: string;
    event_id?: string;
    event?: SlackEvent;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // One-time endpoint verification when you set the Request URL in Slack.
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const ev = payload.event;
  // Only human DMs to the bot. Skip bot messages, edits/joins (subtype), etc.
  if (!ev || ev.type !== "message" || ev.bot_id || ev.subtype || !ev.user) {
    return NextResponse.json({ ok: true });
  }

  const handle = ev.user;

  const bound = await isHandleBound("slack", handle);
  if (!bound) {
    const link = await redeemChannelLinkCode("slack", handle, ev.text, { provider: "slack" });
    // Whether it was an unknown sender (no code) or a just-completed bind, the
    // activation message carries no user data — acknowledge without capturing it.
    // (No auto-reply here; that would need chat.postMessage. The app UI confirms.)
    return NextResponse.json({ ok: true });
  }

  const attachments: IngestAttachment[] = [];
  for (const f of ev.files ?? []) {
    const att = await fetchFile(f);
    if (att) attachments.push(att);
  }

  const envelope: IngestEnvelope = {
    channel: "slack",
    captureMode: "active",
    recipient: handle, // shared bot → resolve by sender
    externalId: ev.client_msg_id ?? payload.event_id ?? undefined,
    sender: handle,
    bodyText: ev.text ?? undefined,
    attachments: attachments.length ? attachments : undefined,
    meta: { slackTs: ev.ts },
  };

  try {
    await ingest(envelope);
  } catch (e) {
    console.error("[slack] ingest failed", e);
    // 200 anyway so Slack doesn't retry; externalId dedup covers reprocessing.
  }
  return NextResponse.json({ ok: true });
}
