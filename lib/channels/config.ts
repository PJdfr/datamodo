import type { IngestChannel } from "@/lib/ingest/types";

// Per-messaging-channel configuration, read from env. Each platform is a SINGLE
// shared bot (one WhatsApp number, one Slack app, one Teams bot) — never one bot
// per user. Users attach themselves to the shared bot via the linking flow
// (lib/channels/link.ts); we identify them by who sent the message, not by which
// address it was sent to. Email is deliberately NOT here — it routes by
// recipient through Cloudflare (lib/datamodo/inbox.ts), a different model.

export type ChannelId = Extract<IngestChannel, "whatsapp" | "slack" | "teams">;

export const CHANNELS: ChannelId[] = ["whatsapp", "slack", "teams"];

export interface ChannelInfo {
  id: ChannelId;
  label: string;
  /** The bot's public handle the user forwards to (a phone number / @name). */
  botHandle: string | null;
  /** True once the inbound webhook has enough secrets to verify + accept. */
  configured: boolean;
  /** True once outbound replies (link confirmations) are possible. */
  canReply: boolean;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function channelInfo(id: ChannelId): ChannelInfo {
  switch (id) {
    case "whatsapp": {
      const configured = Boolean(env("WHATSAPP_APP_SECRET") && env("WHATSAPP_VERIFY_TOKEN"));
      const canReply = Boolean(env("WHATSAPP_PHONE_NUMBER_ID") && env("WHATSAPP_ACCESS_TOKEN"));
      return { id, label: "WhatsApp", botHandle: env("WHATSAPP_BOT_NUMBER") ?? null, configured, canReply };
    }
    case "slack": {
      const configured = Boolean(env("SLACK_SIGNING_SECRET"));
      const canReply = Boolean(env("SLACK_BOT_TOKEN"));
      return { id, label: "Slack", botHandle: env("SLACK_BOT_HANDLE") ?? null, configured, canReply };
    }
    case "teams": {
      const configured = Boolean(env("TEAMS_APP_ID"));
      const canReply = Boolean(env("TEAMS_APP_ID") && env("TEAMS_APP_PASSWORD"));
      return { id, label: "Microsoft Teams", botHandle: env("TEAMS_BOT_HANDLE") ?? null, configured, canReply };
    }
  }
}

export function allChannelInfo(): ChannelInfo[] {
  return CHANNELS.map(channelInfo);
}

export function isChannelId(v: string): v is ChannelId {
  return (CHANNELS as string[]).includes(v);
}
