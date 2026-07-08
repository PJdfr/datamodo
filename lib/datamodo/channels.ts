import type { SupabaseClient } from "@supabase/supabase-js";
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
  db: SupabaseClient,
  orgId: string,
  ownerUserId: string,
  channel: IngestChannel,
  ttlMinutes = DEFAULT_TTL_MINUTES,
): Promise<ChannelLinkCode> {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintCode();
    const { error } = await db.from("channel_link_codes").insert({
      code,
      org_id: orgId,
      owner_user_id: ownerUserId,
      channel,
      expires_at: expiresAt,
    });
    if (!error) return { code, channel, expiresAt };
    if ((error as { code?: string }).code !== "23505") throw error; // unique_violation → retry
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
  admin: SupabaseClient,
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
  const { data: rows, error } = await admin
    .from("channel_link_codes")
    .select("id, org_id, owner_user_id")
    .in("code", candidates)
    .eq("channel", channel)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) throw error;
  const match = rows?.[0] as { id: string; org_id: string; owner_user_id: string } | undefined;
  if (!match) return null;

  // Consume the code (guard against a concurrent double-redeem).
  const { data: consumed, error: consumeErr } = await admin
    .from("channel_link_codes")
    .update({ consumed_at: new Date().toISOString(), consumed_handle: handle })
    .eq("id", match.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeErr) throw consumeErr;
  if (!consumed) return null; // lost the race; someone else consumed it

  // Bind (channel, handle) → this user. Last valid claim wins.
  const { data: source, error: upErr } = await admin
    .from("ingest_sources")
    .upsert(
      {
        org_id: match.org_id,
        owner_user_id: match.owner_user_id,
        channel,
        handle,
        display_name: opts.displayName ?? null,
        provider: opts.provider ?? null,
        status: "active",
      },
      { onConflict: "channel,handle" },
    )
    .select("id")
    .single();
  if (upErr) throw upErr;

  return { sourceId: source.id, ownerUserId: match.owner_user_id, orgId: match.org_id };
}

/** Whether a sender handle is already bound to a user on this channel. */
export async function isHandleBound(
  admin: SupabaseClient,
  channel: IngestChannel,
  handle: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("ingest_sources")
    .select("id")
    .eq("channel", channel)
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
