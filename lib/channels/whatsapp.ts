import { createHmac, timingSafeEqual } from "node:crypto";
import { whatsappHandle } from "./handles";
import type { InboundAttachment, InboundMessage, ReplyFn } from "./inbound";

// WhatsApp adapter (Meta WhatsApp Cloud API). One Business number is the shared
// bot; users save it as a contact and forward. Inbound arrives as a webhook
// POST signed with the app secret; we reply and download media via the Graph API.

const GRAPH = "https://graph.facebook.com/v21.0";

/** GET verification handshake Meta performs when you register the webhook URL. */
export function verifySubscription(url: URL): { ok: true; challenge: string } | { ok: false } {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

/** Verify X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret). */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WaValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: {
    id: string;
    from: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    image?: { id: string; mime_type?: string; caption?: string };
    document?: { id: string; mime_type?: string; filename?: string; caption?: string };
    audio?: { id: string; mime_type?: string };
    video?: { id: string; mime_type?: string; caption?: string };
  }[];
}

interface WaWebhook {
  entry?: { changes?: { value?: WaValue }[] }[];
}

/** Download a media object by id via the Graph API (needs the access token). */
async function fetchMedia(mediaId: string): Promise<InboundAttachment | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!bin.ok) return null;
  const buf = Buffer.from(await bin.arrayBuffer());
  return { dataBase64: buf.toString("base64"), contentType: meta.mime_type };
}

/** Normalize a verified webhook body into InboundMessage[] (media inlined). */
export async function parseWebhook(body: unknown): Promise<InboundMessage[]> {
  const wh = body as WaWebhook;
  const out: InboundMessage[] = [];
  for (const entry of wh.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const botAccount = value.metadata?.display_phone_number;
      const nameOf = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages) {
        const media = m.image ?? m.document ?? m.audio ?? m.video;
        const attachments: InboundAttachment[] = [];
        if (media?.id) {
          const att = await fetchMedia(media.id);
          if (att) {
            attachments.push({ ...att, filename: (m.document?.filename) ?? att.filename });
          }
        }
        const caption = m.text?.body ?? m.image?.caption ?? m.document?.caption ?? m.video?.caption;
        const handle = whatsappHandle(m.from);
        out.push({
          handle,
          displayName: nameOf.get(m.from) ?? undefined,
          externalId: m.id,
          botAccount,
          text: caption,
          sentAt: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : undefined,
          attachments: attachments.length ? attachments : undefined,
          meta: { type: m.type },
          // WhatsApp can't be re-fetched, so this ref is a deep link only —
          // wa.me opens the chat with the sender. The stored content is the
          // source of truth (see lib/ingest/retention.ts).
          sourceRef: { provider: "whatsapp", messageId: m.id, from: handle, deepLink: `https://wa.me/${m.from.replace(/[^\d]/g, "")}` },
        });
      }
    }
  }
  return out;
}

/** Send a text reply back to the sender via the Cloud API. */
export const reply: ReplyFn = async (msg, text) => {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;
  const to = msg.handle.replace(/^\+/, "");
  await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
};
