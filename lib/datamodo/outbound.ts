// OUTBOUND channel messages — how a review ping travels BACK to the user
// over the channel their message arrived on. Everything fails soft (missing
// env = the channel is dormant, never an error), mirroring how inbound
// adapters behave. Senders:
//   whatsapp — Twilio REST (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN +
//              TWILIO_WHATSAPP_FROM, the shared bot number)
//   slack    — chat.postMessage with SLACK_BOT_TOKEN (handle = user/channel id)
//   email    — Resend (RESEND_API_KEY + EMAIL_FROM; RESEND_BASE_URL override
//              for tests/self-hosted proxies). Email has no reply loop yet —
//              the ping links to the Review tab instead of "reply 1 yes".
//   teams    — no outbound sender yet: pings are skipped (the Review tab
//              still shows everything).

import type { IngestChannel } from "@/lib/ingest/types";

export interface SendResult {
  sent: boolean;
  reason?: string;
}

async function sendWhatsApp(to: string, text: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { sent: false, reason: "twilio env not set" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: `whatsapp:${from}`,
        To: `whatsapp:${to}`,
        Body: text,
      }),
    });
    if (!res.ok) return { sent: false, reason: `twilio ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String((e as Error)?.message ?? e) };
  }
}

async function sendSlack(channel: string, text: string): Promise<SendResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { sent: false, reason: "slack bot token not set" };
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ channel, text }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!json.ok) return { sent: false, reason: `slack ${json.error ?? res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String((e as Error)?.message ?? e) };
  }
}

async function sendEmail(to: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, reason: "resend env not set" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { sent: false, reason: "handle is not an email address" };
  const base = (process.env.RESEND_BASE_URL?.trim() || "https://api.resend.com").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "datamodo — a few things need your OK",
        text,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { sent: false, reason: `resend ${res.status}${err.message ? ` ${err.message}` : ""}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String((e as Error)?.message ?? e) };
  }
}

/** Send `text` to `handle` on `channel`. Never throws. */
export async function sendChannelText(
  channel: IngestChannel,
  handle: string,
  text: string,
): Promise<SendResult> {
  if (!handle) return { sent: false, reason: "no handle" };
  switch (channel) {
    case "whatsapp":
      return sendWhatsApp(handle, text);
    case "slack":
      return sendSlack(handle, text);
    case "email":
      return sendEmail(handle, text);
    default:
      return { sent: false, reason: `no outbound sender for ${channel}` };
  }
}
