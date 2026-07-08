import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import type { IngestChannel } from "./types";

// Content-retention lifecycle. See migration 20260708130000_item_retention.sql.
//
// The decision axis is NOT the channel name but whether the ORIGINAL can be
// re-fetched from the provider later. Only re-fetchable channels get their heavy
// content dropped after review; everything else is retained, because dropping it
// would be irreversible data loss.

const BUCKET = "ingest";

/**
 * Can we re-fetch an item's original from the provider on demand?
 *   slack  → yes  (conversations.history + files.info; token permitting)
 *   others → no   (WhatsApp Cloud API has no read API; Cloudflare email is
 *                  push-once; a Teams bot can't read history). Email flips to
 *                  true the day a Gmail/Graph OAuth mailbox is connected — wire
 *                  that here, don't special-case elsewhere.
 */
export function isRefetchable(channel: IngestChannel): boolean {
  return channel === "slack";
}

/** Still-pending proposals block dereferencing — the reviewer needs the source. */
async function hasPendingProposals(admin: SupabaseClient, itemId: string): Promise<boolean> {
  const { count, error } = await admin
    .from("dataset_rows")
    .select("id", { count: "exact", head: true })
    .eq("source_item_id", itemId)
    .eq("status", "proposed");
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Delete Storage objects for any blobs that have dropped to ref_count <= 0.
 *  A freshly stored blob sits at ref_count 0 for the instant between its row
 *  insert and the item/attachment insert that bumps it, so we only sweep blobs
 *  older than this window to avoid deleting one mid-capture. */
const GC_MIN_AGE_MS = 10 * 60 * 1000;

async function gcOrphanBlobs(admin: SupabaseClient, orgId: string): Promise<void> {
  const cutoff = new Date(Date.now() - GC_MIN_AGE_MS).toISOString();
  const { data, error } = await admin
    .from("blobs")
    .select("hash, storage_path")
    .eq("org_id", orgId)
    .lte("ref_count", 0)
    .lt("created_at", cutoff);
  if (error) throw error;
  const orphans = (data ?? []) as { hash: string; storage_path: string }[];
  if (!orphans.length) return;
  // Remove the bytes first; only drop the index row if that succeeded, so we
  // never lose the pointer to an object that still exists in Storage.
  const { error: rmErr } = await admin.storage.from(BUCKET).remove(orphans.map((o) => o.storage_path));
  if (rmErr) {
    console.error("[retention] storage remove failed", rmErr);
    return;
  }
  const { error: delErr } = await admin
    .from("blobs")
    .delete()
    .eq("org_id", orgId)
    .in("hash", orphans.map((o) => o.hash));
  if (delErr) console.error("[retention] blob row delete failed", delErr);
}

/**
 * Drop an item's stored content down to its source_ref, IF it is safe to:
 * the item is still hydrated, its channel is re-fetchable, and no proposal from
 * it is pending. Deleting attachment rows + nulling the body/raw hashes fires the
 * ref-count triggers; orphaned blobs are then GC'd from Storage. A no-op when any
 * guard fails, so it is safe to call after every proposal resolution.
 */
export async function dereferenceItemIfSafe(admin: SupabaseClient, itemId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("items")
    .select("id, org_id, channel, content_state")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  const item = data as { id: string; org_id: string; channel: IngestChannel; content_state: string } | null;
  if (!item || item.content_state !== "hydrated") return false;
  if (!isRefetchable(item.channel)) return false;
  if (await hasPendingProposals(admin, itemId)) return false;

  // Attachments: deleting the rows decrements each blob (trigger), and the
  // row's own delete cascades nothing else.
  const { error: attErr } = await admin.from("attachments").delete().eq("item_id", itemId);
  if (attErr) throw attErr;

  // Body/raw blobs: null the hashes; the UPDATE trigger decrements them.
  const { error: upErr } = await admin
    .from("items")
    .update({ body_hash: null, raw_hash: null, content_state: "dereferenced" })
    .eq("id", itemId);
  if (upErr) throw upErr;

  await gcOrphanBlobs(admin, item.org_id);
  return true;
}

/**
 * Retention hook called after proposals resolve. Best-effort and isolated: a
 * failure here must never fail the user's accept/reject. Dedupes ids and shares
 * one admin client.
 */
export async function dereferenceItems(itemIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(itemIds.filter((v): v is string => Boolean(v)))];
  if (!ids.length) return;
  try {
    const admin = createAdminClient();
    for (const id of ids) {
      try {
        await dereferenceItemIfSafe(admin, id);
      } catch (e) {
        console.error("[retention] dereference failed", id, e);
      }
    }
  } catch (e) {
    console.error("[retention] hook skipped", e);
  }
}
