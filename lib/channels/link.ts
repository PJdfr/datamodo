import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelId } from "./config";

// Account-linking: turn a user's proof-of-identity on a messaging platform into
// a durable (channel, handle) → user mapping in ingest_sources.
//
//   mint  (dashboard, user's RLS client) → a short one-time code
//   claim (webhook adapter, service role) → consumes the code, writes the source
//
// After a successful claim the sender's handle is a known ingest_source, so
// resolveTarget() attributes every future message from them without any code.

const CODE_TTL_MS = 15 * 60 * 1000; // a code is good for 15 minutes
// Unambiguous alphabet — no 0/O/1/I/L so a code is easy to read and re-type.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const BODY_LEN = 5;

/** Canonical form we store and compare on: 'DM' + uppercased body, no dash. */
function canonicalize(raw: string): string | null {
  const m = raw.toUpperCase().match(/DM[-\s]?([A-Z0-9]{5})/);
  return m ? `DM${m[1]}` : null;
}

/** How the code is shown to the user (dashboard + bot copy): 'DM-7F3K9'. */
export function displayCode(code: string): string {
  return code.startsWith("DM") ? `DM-${code.slice(2)}` : code;
}

/** Pull a link code out of an inbound message body, if present. */
export function extractLinkCode(text: string | undefined | null): string | null {
  return text ? canonicalize(text) : null;
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BODY_LEN));
  let body = "";
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  return `DM${body}`;
}

/**
 * Mint a fresh link code for a user+channel (dashboard server action). Runs on
 * the user's RLS client — the insert policy pins owner_user_id to auth.uid().
 * Returns the display form ('DM-XXXXX').
 */
export async function mintLinkCode(
  db: SupabaseClient,
  orgId: string,
  ownerUserId: string,
  channel: ChannelId,
): Promise<string> {
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { error } = await db.from("channel_link_codes").insert({
      code,
      org_id: orgId,
      owner_user_id: ownerUserId,
      channel,
      expires_at: expiresAt,
    });
    if (!error) return displayCode(code);
    if ((error as { code?: string }).code !== "23505") throw error; // not a collision
  }
  throw new Error("Could not allocate a link code — try again.");
}

export type ClaimResult =
  | { ok: true; orgId: string; ownerUserId: string }
  | { ok: false; reason: "no_code" | "invalid" };

/**
 * Consume a link code presented over a messaging channel (webhook adapter,
 * service role). Atomically claims an unconsumed, unexpired code for the SAME
 * channel, then upserts the durable source mapping. Idempotent: a handle that
 * is already linked is treated as success.
 */
export async function claimLinkCode(
  admin: SupabaseClient,
  channel: ChannelId,
  handle: string,
  text: string | undefined,
  displayName?: string,
): Promise<ClaimResult> {
  const code = extractLinkCode(text);
  if (!code) return { ok: false, reason: "no_code" };

  // Atomic claim — the `consumed_at is null` guard makes concurrent sends race
  // for the same code safely; only one update returns a row.
  const { data, error } = await admin
    .from("channel_link_codes")
    .update({ consumed_at: new Date().toISOString(), consumed_handle: handle })
    .eq("code", code)
    .eq("channel", channel)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("org_id, owner_user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "invalid" };

  const { error: srcErr } = await admin.from("ingest_sources").insert({
    org_id: data.org_id,
    owner_user_id: data.owner_user_id,
    channel,
    handle,
    display_name: displayName ?? null,
    provider: channel,
    status: "active",
  });
  // 23505 = this (channel, handle) is already linked → still a success.
  if (srcErr && (srcErr as { code?: string }).code !== "23505") throw srcErr;

  return { ok: true, orgId: data.org_id, ownerUserId: data.owner_user_id };
}

/** The user's active (already-linked) handle for a channel, if any. */
export async function linkedHandle(
  db: SupabaseClient,
  ownerUserId: string,
  channel: ChannelId,
): Promise<string | null> {
  const { data, error } = await db
    .from("ingest_sources")
    .select("handle")
    .eq("owner_user_id", ownerUserId)
    .eq("channel", channel)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { handle: string } | null)?.handle ?? null;
}
