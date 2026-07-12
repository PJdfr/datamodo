import { prisma } from "@/lib/prisma";
import type { IngestChannel } from "@/lib/ingest/types";

// Identify-once linking for shared-bot channels (WhatsApp, Teams, Slack…).
// Email uses a unique per-user address instead (see lib/datamodo/inbox.ts); these
// channels share one bot, so a user proves ownership of their sender identity
// (wa_id, AAD id, …) once by sending a short code to the bot. See migration
// 20260708130000_channel_link_codes.sql.

// Unambiguous alphabet (no 0/O/1/I/L/U) — easy to read and type on a phone.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 8;
const DEFAULT_TTL_MINUTES = 30;

/** A token that could be one of our codes, for extracting from free-form text. */
const CODE_TOKEN_RE = new RegExp(`[${CODE_ALPHABET}]{${CODE_LEN}}`, "g");

function mintCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export interface ChannelLinkCode {
  code: string;
  channel: IngestChannel;
  expiresAt: string;
}

/**
 * Mint a single-use link code for a channel. Shown to the user in-app; they
 * send it to the shared bot to bind their sender identity. Retries on the
 * (astronomically unlikely) code collision.
 */
export async function createChannelLinkCode(
  orgId: string,
  ownerUserId: string,
  channel: IngestChannel,
  ttlMinutes = DEFAULT_TTL_MINUTES,
): Promise<ChannelLinkCode> {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintCode();
    try {
      await prisma.channel_link_codes.create({
        data: {
          code,
          org_id: orgId,
          owner_user_id: ownerUserId,
          channel,
          expires_at: expiresAt,
        },
      });
      return { code, channel, expiresAt };
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error; // unique_violation → retry
    }
  }
  throw new Error("Could not allocate a link code — try again.");
}

export interface BoundSource {
  sourceId: string;
  ownerUserId: string;
  orgId: string;
}

/**
 * Try to bind an inbound message's sender to a user via a link code in its text.
 * Server-side only (admin client): scans `text` for a live, matching-channel
 * code, consumes it, and upserts an ACTIVE ingest_source (channel, handle) →
 * owner. Returns the bound source, or null if no valid code was present.
 */
export async function redeemChannelLinkCode(
  channel: IngestChannel,
  handle: string,
  text: string | null | undefined,
  opts: { provider?: string; displayName?: string } = {},
): Promise<BoundSource | null> {
  const candidates = Array.from(
    new Set((text?.toUpperCase().match(CODE_TOKEN_RE) ?? [])),
  );
  if (candidates.length === 0) return null;

  // Find a live (unconsumed, unexpired) code for THIS channel among the tokens.
  const rows = await prisma.channel_link_codes.findMany({
    where: {
      code: { in: candidates },
      channel,
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    select: { id: true, org_id: true, owner_user_id: true },
    take: 1,
  });
  const match = rows[0];
  if (!match) return null;

  // Consume the code (guard against a concurrent double-redeem).
  const consumedResult = await prisma.channel_link_codes.updateMany({
    where: { id: match.id, consumed_at: null },
    data: { consumed_at: new Date(), consumed_handle: handle },
  });
  if (consumedResult.count === 0) return null; // lost the race; someone else consumed it

  // Bind (channel, handle) → this user. Last valid claim wins.
  const source = await prisma.ingest_sources.upsert({
    where: { channel_handle: { channel, handle } },
    create: {
      org_id: match.org_id,
      owner_user_id: match.owner_user_id,
      channel,
      handle,
      display_name: opts.displayName ?? null,
      provider: opts.provider ?? null,
      status: "active",
    },
    update: {
      org_id: match.org_id,
      owner_user_id: match.owner_user_id,
      display_name: opts.displayName ?? null,
      provider: opts.provider ?? null,
      status: "active",
    },
    select: { id: true },
  });

  return { sourceId: source.id, ownerUserId: match.owner_user_id, orgId: match.org_id };
}

/** Whether a sender handle is already bound to a user on this channel. */
export async function isHandleBound(
  channel: IngestChannel,
  handle: string,
): Promise<boolean> {
  return (await getBoundSource(channel, handle)) !== null;
}

/** The bound source (with its org/owner) behind a sender handle, or null —
 *  what webhooks need to act on a message beyond just capturing it. */
export async function getBoundSource(
  channel: IngestChannel,
  handle: string,
): Promise<BoundSource | null> {
  const data = await prisma.ingest_sources.findFirst({
    where: { channel, handle, status: "active" },
    select: { id: true, org_id: true, owner_user_id: true },
  });
  return data
    ? { sourceId: data.id, ownerUserId: data.owner_user_id ?? "", orgId: data.org_id }
    : null;
}
