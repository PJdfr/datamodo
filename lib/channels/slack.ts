import { createHmac, timingSafeEqual } from "node:crypto";
import { slackHandle } from "./handles";
import type { InboundMessage, ReplyFn } from "./inbound";

// Slack adapter (Events API). One Slack app is the shared bot; a user DMs or
// forwards a message to it. Inbound arrives as a signed JSON POST; the first
// call is a one-time url_verification challenge. Replies use chat.postMessage.

/** Verify Slack's v0 request signature over `v0:timestamp:body`. */
export function verifySignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  // Reject stale timestamps (>5 min) to blunt replay attacks.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface SlackEvent {
  type: string;
  challenge?: string;
  team_id?: string;
  authorizations?: { user_id?: string }[];
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    user?: string;
    text?: string;
    ts?: string;
    channel?: string;
    client_msg_id?: string;
  };
}

export type ParseResult =
  | { kind: "challenge"; challenge: string }
  | { kind: "events"; messages: InboundMessage[] };

/** Normalize a verified Events API body: the URL challenge, or message events. */
export function parseWebhook(body: unknown): ParseResult {
  const b = body as SlackEvent;
  if (b.type === "url_verification" && b.challenge) {
    return { kind: "challenge", challenge: b.challenge };
  }

  const e = b.event;
  const messages: InboundMessage[] = [];
  // Only real human messages — skip bot echoes, edits, joins, and our own posts.
  if (e && e.type === "message" && !e.subtype && !e.bot_id && e.user && e.text) {
    messages.push({
      handle: slackHandle(b.team_id ?? "", e.user),
      displayName: e.user,
      externalId: e.client_msg_id ?? (e.channel && e.ts ? `${e.channel}:${e.ts}` : e.ts),
      botAccount: b.authorizations?.[0]?.user_id,
      text: e.text,
      sentAt: e.ts ? new Date(Number(e.ts) * 1000).toISOString() : undefined,
      meta: { channel: e.channel, ts: e.ts },
    });
  }
  return { kind: "events", messages };
}

/** Reply in the same channel/DM the message came from. */
export const reply: ReplyFn = async (msg, text) => {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = (msg.meta?.channel as string | undefined) ?? undefined;
  if (!token || !channel) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text }),
  });
};
