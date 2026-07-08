import type { ChannelId } from "./config";

// A "handle" is the stable, normalized identifier for a person ON a platform —
// the key we store in ingest_sources and match inbound messages against. Each
// platform names people differently, so normalization is per-channel. Whatever
// an adapter extracts from a webhook must pass through here before it is stored
// or looked up, so the mint side and the match side always agree.

/** WhatsApp gives a `wa_id` (E.164 digits, no '+'). Canonical: '+' + digits. */
export function whatsappHandle(waId: string): string {
  const digits = waId.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

/** Slack user ids are only unique within a workspace, so scope by team. */
export function slackHandle(teamId: string, userId: string): string {
  return `${teamId.trim()}:${userId.trim()}`;
}

/** Teams: prefer the tenant-stable AAD object id; fall back to the channel id. */
export function teamsHandle(aadObjectId: string | undefined, fromId: string): string {
  return (aadObjectId ?? fromId).trim();
}

/** A friendly label for the person, used only for display (item.sender). */
export function normalizeHandle(channel: ChannelId, raw: string): string {
  return channel === "whatsapp" ? whatsappHandle(raw) : raw.trim();
}
