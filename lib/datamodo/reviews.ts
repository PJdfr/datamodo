import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeEntities } from "./knowledge";

// The knowledge review queue, surfaced to the user for validation. Items are the
// knowledge layer's uncertain decisions — proposed entity merges and fact
// conflicts — ranked by IMPACT (edges/rows affected) so the most consequential
// are triaged first. See migration 20260708150000 and lib/datamodo/knowledge.ts.

export interface ReviewItem {
  id: string;
  kind: "entity_merge" | "fact_conflict";
  confidence: number | null;
  impact: number;
  summary: string;
  createdAt: string;
}

interface ReviewRow {
  id: string;
  kind: "entity_merge" | "fact_conflict";
  status: string;
  confidence: number | null;
  impact: number;
  source_entity_id: string | null;
  target_entity_id: string | null;
  old_fact_id: string | null;
  new_fact_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

/** Pending reviews for a user, most impactful first. */
export async function listPendingReviews(db: SupabaseClient, orgId: string): Promise<ReviewItem[]> {
  const { data, error } = await db
    .from("knowledge_reviews")
    .select("id, kind, status, confidence, impact, source_entity_id, target_entity_id, old_fact_id, new_fact_id, detail, created_at")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("impact", { ascending: false })
    .order("confidence", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const rows = (data as ReviewRow[] | null) ?? [];

  // Resolve labels for readable summaries in one round-trip each.
  const entityIds = new Set<string>();
  const factIds = new Set<string>();
  for (const r of rows) {
    if (r.target_entity_id) entityIds.add(r.target_entity_id);
    if (r.source_entity_id) entityIds.add(r.source_entity_id);
    if (r.old_fact_id) factIds.add(r.old_fact_id);
    if (r.new_fact_id) factIds.add(r.new_fact_id);
  }
  const entityLabel = new Map<string, string>();
  if (entityIds.size) {
    const { data: es } = await db.from("entities").select("id, canonical_label").in("id", [...entityIds]);
    for (const e of (es as { id: string; canonical_label: string }[] | null) ?? []) entityLabel.set(e.id, e.canonical_label);
  }
  const factVal = new Map<string, string>();
  if (factIds.size) {
    const { data: fs } = await db.from("facts").select("id, value_text, value_num, value_date, unit").in("id", [...factIds]);
    for (const f of (fs as { id: string; value_text: string | null; value_num: number | null; value_date: string | null; unit: string | null }[] | null) ?? [])
      factVal.set(f.id, f.value_num != null ? `${f.value_num}${f.unit ? " " + f.unit : ""}` : f.value_date ?? f.value_text ?? "?");
  }

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    confidence: r.confidence,
    impact: r.impact,
    createdAt: r.created_at,
    summary:
      r.kind === "entity_merge"
        ? `Is "${(r.detail.parsedLabel as string) ?? entityLabel.get(r.source_entity_id ?? "") ?? "?"}" the same as "${entityLabel.get(r.target_entity_id ?? "") ?? "?"}"?`
        : `"${r.detail.predicate as string}" changed: ${factVal.get(r.old_fact_id ?? "") ?? "?"} → ${factVal.get(r.new_fact_id ?? "") ?? "?"}`,
  }));
}

/** Accept a review: apply the merge, or confirm the conflict resolution. */
export async function acceptReview(db: SupabaseClient, orgId: string, id: string): Promise<void> {
  const { data, error } = await db
    .from("knowledge_reviews").select("*").eq("org_id", orgId).eq("id", id).eq("status", "pending").maybeSingle();
  if (error) throw error;
  const r = data as ReviewRow | null;
  if (!r) return;

  if (r.kind === "entity_merge" && r.source_entity_id && r.target_entity_id) {
    // Merge the newly-parsed entity INTO the canonical one.
    await mergeEntities(db, orgId, r.source_entity_id, r.target_entity_id);
  }
  // fact_conflict: the supersession is already applied; accept = confirm.
  await db.from("knowledge_reviews")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", id);
}

/** Reject a review: leave entities separate, or REVERT a fact supersession. */
export async function rejectReview(db: SupabaseClient, orgId: string, id: string): Promise<void> {
  const { data, error } = await db
    .from("knowledge_reviews").select("*").eq("org_id", orgId).eq("id", id).eq("status", "pending").maybeSingle();
  if (error) throw error;
  const r = data as ReviewRow | null;
  if (!r) return;

  if (r.kind === "fact_conflict" && r.old_fact_id && r.new_fact_id) {
    // Undo the supersession: retire the new fact, restore the old as current.
    const now = new Date().toISOString();
    await db.from("facts").update({ valid_to: now }).eq("id", r.new_fact_id);
    await db.from("facts").update({ valid_to: null, superseded_by: null }).eq("id", r.old_fact_id);
  }
  // entity_merge: nothing was merged (we only proposed), so rejecting is a no-op
  // beyond marking it.
  await db.from("knowledge_reviews")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", id);
}
