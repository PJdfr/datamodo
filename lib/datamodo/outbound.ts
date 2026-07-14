// OUTBOUND channel messages — how a review ping travels BACK to the user
// over the channel their message arrived on. Everything fails soft (missing
// env = the channel is dormant, never an error), mirroring how inbound
// adapters behave. Senders:
//   whatsapp — Twilio REST (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN +
//              TWILIO_WHATSAPP_FROM, the shared bot number)
//   slack    — chat.postMessage with SLACK_BOT_TOKEN (handle = user/channel id)
//   email/teams — no outbound sender yet: pings are skipped (the Review tab
//              still shows everything); an email provider is a roadmap item.

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
    default:
      return { sent: false, reason: `no outbound sender for ${channel}` };
  }
}
