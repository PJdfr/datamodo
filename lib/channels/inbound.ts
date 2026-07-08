import { createAdminClient } from "@/utils/supabase/admin";
import { ingest } from "@/lib/ingest/store";
import type { ChannelId } from "./config";
import { claimLinkCode } from "./link";

// The channel-agnostic core of every messaging adapter. An adapter's only job is
// to verify the request and normalize its provider payload into InboundMessage[]
// (plus a reply fn); this function does the rest identically for all of them:
//
//   linked sender?  → ingest the message (attributed via ingest_sources)
//   unlinked + code → claim it, confirm, and stop (this was a linking message)
//   unlinked, none  → nudge the user toward the dashboard linking flow
//
// So WhatsApp/Slack/Teams share one behavior; the per-platform files stay thin.

export interface InboundAttachment {
  filename?: string;
  contentType?: string;
  dataBase64: string;
}

export interface InboundMessage {
  /** Normalized sender handle (see lib/channels/handles.ts) — the routing key. */
  handle: string;
  /** Human-friendly sender name for display, if the platform provides one. */
  displayName?: string;
  /** Provider message id — the idempotency key. */
  externalId?: string;
  /** The bot identity this arrived at (our number / app), for provenance. */
  botAccount?: string;
  text?: string;
  sentAt?: string;
  attachments?: InboundAttachment[];
  meta?: Record<string, unknown>;
}

export type ReplyFn = (msg: InboundMessage, text: string) => Promise<void>;

async function isLinked(admin: ReturnType<typeof createAdminClient>, channel: ChannelId, handle: string) {
  const { data, error } = await admin
    .from("ingest_sources")
    .select("id")
    .eq("channel", channel)
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Best-effort reply — a failed confirmation must never fail the webhook. */
async function safeReply(reply: ReplyFn | undefined, msg: InboundMessage, text: string) {
  if (!reply) return;
  try {
    await reply(msg, text);
  } catch (e) {
    console.error("[channels] reply failed", e);
  }
}

export async function handleInbound(
  channel: ChannelId,
  messages: InboundMessage[],
  reply?: ReplyFn,
): Promise<void> {
  const admin = createAdminClient();

  for (const msg of messages) {
    if (!msg.handle) continue;

    if (!(await isLinked(admin, channel, msg.handle))) {
      const claim = await claimLinkCode(admin, channel, msg.handle, msg.text, msg.displayName);
      if (claim.ok) {
        await safeReply(reply, msg, "✅ Connected to Datamodo. Forward anything here and it lands in your workspace for an agent to review.");
      } else if (claim.reason === "invalid") {
        await safeReply(reply, msg, "That link code is invalid or has expired. Open Datamodo → Channels → Connect and send me the fresh code.");
      } else {
        await safeReply(reply, msg, "👋 I'm the Datamodo capture bot. To connect, open Datamodo → Channels → Connect and send me the code shown there.");
      }
      continue;
    }

    // Linked sender → capture. recipient = the sender's handle because messaging
    // routes by WHO sent it (resolveTarget matches ingest_sources on the handle).
    await ingest({
      channel,
      captureMode: "active",
      recipient: msg.handle,
      sender: msg.displayName ?? msg.handle,
      externalId: msg.externalId,
      externalAccount: msg.botAccount,
      subject: undefined,
      bodyText: msg.text,
      sentAt: msg.sentAt,
      attachments: msg.attachments,
      meta: { handle: msg.handle, ...(msg.meta ?? {}) },
    });
  }
}
