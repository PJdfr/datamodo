import type { SupabaseClient } from "@supabase/supabase-js";

// Per-user inbound email addresses. Every user gets a unique
// `<token>@datamodo.email` address; anything Cloudflare Email Routing catches
// for it is POSTed to /api/ingest, where resolveTarget() matches the recipient
// against forwarding_addresses to attribute the message to this user. Minting an
// address is a plain DB insert — the domain-wide catch-all means there is no
// per-address provisioning call to Cloudflare, so this scales to any number of
// users.

/** The inbound domain the Cloudflare catch-all is configured for. */
export function inboundEmailDomain(): string {
  return process.env.INBOUND_EMAIL_DOMAIN?.trim() || "datamodo.email";
}

/** A short, url-safe, lowercase local part (~80 bits of entropy). */
function mintLocalPart(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/** The user's existing inbound address, if one has been provisioned. */
export async function getInbox(
  db: SupabaseClient,
  ownerUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("forwarding_addresses")
    .select("address")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { address: string } | null)?.address ?? null;
}

/**
 * Return the user's inbound address, minting one if they don't have it yet.
 * Retries on the (astronomically unlikely) unique-address collision.
 */
export async function provisionInbox(
  db: SupabaseClient,
  orgId: string,
  ownerUserId: string,
  label = "Personal inbox",
): Promise<string> {
  const existing = await getInbox(db, ownerUserId);
  if (existing) return existing;

  const domain = inboundEmailDomain();
  for (let attempt = 0; attempt < 5; attempt++) {
    const address = `${mintLocalPart()}@${domain}`;
    const { error } = await db
      .from("forwarding_addresses")
      .insert({ org_id: orgId, owner_user_id: ownerUserId, address, label });
    if (!error) return address;
    // 23505 = unique_violation: another address grabbed this token; try again.
    if ((error as { code?: string }).code !== "23505") throw error;
  }
  throw new Error("Could not allocate an inbox address — try again.");
}

/** Retire the user's current inbound address(es) and mint a fresh one (e.g. if
 *  an address starts receiving spam). */
export async function regenerateInbox(
  db: SupabaseClient,
  orgId: string,
  ownerUserId: string,
): Promise<string> {
  const { error } = await db
    .from("forwarding_addresses")
    .delete()
    .eq("org_id", orgId)
    .eq("owner_user_id", ownerUserId);
  if (error) throw error;
  return provisionInbox(db, orgId, ownerUserId);
}
