import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { ingest } from "@/lib/ingest/store";
import { isHandleBound, redeemChannelLinkCode } from "@/lib/datamodo/channels";
import type { IngestAttachment, IngestEnvelope } from "@/lib/ingest/types";

// WhatsApp inbound adapter (Twilio BSP). Twilio delivers each inbound message
// as an application/x-www-form-urlencoded POST signed with X-Twilio-Signature.
// One shared WhatsApp number serves every user; we identify the user by their
// wa_id (sender), bound once via a link code (see lib/datamodo/channels.ts).
export const runtime = "nodejs";

/**
 * Twilio request signature: base64(HMAC-SHA1(authToken, url + sortedParams)),
 * where sortedParams is every POST field, keys sorted, concatenated as
 * key+value with no separators. https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
function validSignature(url: string, params: URLSearchParams, header: string, token: string): boolean {
  const keys = Array.from(new Set(Array.from(params.keys()))).sort();
  let data = url;
  for (const k of keys) data += k + (params.get(k) ?? "");
  const expected = createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The exact public URL Twilio was configured to call (proxies rewrite host/proto). */
function webhookUrl(req: Request): string {
  const configured = process.env.TWILIO_WHATSAPP_WEBHOOK_URL?.trim();
  return configured || new URL(req.url).toString();
}

/** Strip Twilio's "whatsapp:" scheme prefix from an address. */
function bareNumber(v: string | null): string {
  return (v ?? "").replace(/^whatsapp:/i, "").trim();
}

function twiml(message?: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(body, { headers: { "content-type": "text/xml" } });
}

/** Download a Twilio media URL (needs Basic auth) and return it as an attachment. */
async function fetchMedia(url: string, contentType: string | null): Promise<IngestAttachment | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  const res = await fetch(url, {
    headers: { authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = contentType ?? res.headers.get("content-type") ?? undefined;
  return { contentType: ct, dataBase64: buf.toString("base64") };
}

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.error("[whatsapp] TWILIO_AUTH_TOKEN not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!validSignature(webhookUrl(req), params, signature, token)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  const waId = params.get("WaId") || bareNumber(params.get("From"));
  if (!waId) return twiml(); // nothing to attribute

  const body = params.get("Body");
  const profileName = params.get("ProfileName") ?? undefined;
  const admin = createAdminClient();

  // Identify-once: bind this sender if not already, using a code in the message.
  let bound = await isHandleBound("whatsapp", waId);
  if (!bound) {
    const link = await redeemChannelLinkCode("whatsapp", waId, body, {
      provider: "twilio",
      displayName: profileName,
    });
    if (link) {
      return twiml("✅ Connected to datamodo. Forward messages here and they'll show up in your workspace.");
    }
    // Unknown sender, no valid code — don't capture; nudge them to connect.
    return twiml("👋 To connect this number to datamodo, open the app and send the code shown under Connect WhatsApp.");
  }

  // Bound sender → capture the message. Pull any media attachments.
  const attachments: IngestAttachment[] = [];
  const numMedia = parseInt(params.get("NumMedia") ?? "0", 10) || 0;
  for (let i = 0; i < numMedia; i++) {
    const url = params.get(`MediaUrl${i}`);
    if (!url) continue;
    const att = await fetchMedia(url, params.get(`MediaContentType${i}`));
    if (att) attachments.push(att);
  }

  const envelope: IngestEnvelope = {
    channel: "whatsapp",
    captureMode: "active",
    recipient: waId, // shared-bot channels resolve by SENDER handle
    externalId: params.get("MessageSid") ?? params.get("SmsMessageSid") ?? undefined,
    externalAccount: bareNumber(params.get("To")), // the shared bot number
    sender: bareNumber(params.get("From")),
    bodyText: body ?? undefined,
    attachments: attachments.length ? attachments : undefined,
    meta: { profileName, waId },
    sentAt: undefined,
  };

  try {
    await ingest(envelope);
  } catch (e) {
    console.error("[whatsapp] ingest failed", e);
    // 200 anyway: a 500 makes Twilio retry for up to a day. Idempotency
    // (externalId=MessageSid) protects us if we later reprocess.
  }
  return twiml();
}
