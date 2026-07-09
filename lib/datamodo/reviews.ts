import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeEntities } from "./knowledge";
import type {
  ReviewItem,
  ReviewEntitySide,
  ReviewFact,
  EntityAttr,
} from "./review-types";

export type { ReviewItem } from "./review-types";

// Builds the typed review view-models the UI renders (see review-types.ts) from
// the raw knowledge_reviews rows + the entities/facts/items they reference. At
// individual-user scale the org's entities/facts are small, so we pull them once
// and assemble in memory rather than issuing a query per card.

interface ReviewRow {
  id: string;
  kind: "entity_merge" | "fact_conflict" | "extraction";
  status: string;
  confidence: number | null;
  impact: number;
  source_entity_id: string | null;
  target_entity_id: string | null;
  old_fact_id: string | null;
  new_fact_id: string | null;
  item_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

interface EntityLite {
  id: string;
  canonical_label: string;
  kind: string;
  natural_keys: Record<string, string>;
}
interface FactLite {
  id: string;
  subject_entity_id: string;
  object_entity_id: string | null;
  predicate: string;
  value_text: string | null;
  value_num: number | null;
  value_date: string | null;
  unit: string | null;
  confidence: number | null;
  source_item_id: string | null;
  valid_to: string | null;
}

function factValue(f: FactLite, label: (id: string) => string): { v: string; ref: boolean } {
  if (f.object_entity_id) return { v: label(f.object_entity_id), ref: true };
  if (f.value_num != null) return { v: `${f.value_num}${f.unit ? " " + f.unit : ""}`, ref: false };
  if (f.value_date) return { v: f.value_date, ref: false };
  return { v: f.value_text ?? "—", ref: false };
}

function entitySide(e: EntityLite | undefined, edges: number, parsedLabel?: string): ReviewEntitySide {
  const attrs: EntityAttr[] = [];
  for (const [k, v] of Object.entries(e?.natural_keys ?? {})) attrs.push({ k: k.replace(/_/g, " "), v: String(v) });
  attrs.push({ k: "connected", v: `${edges} fact${edges === 1 ? "" : "s"}` });
  return { label: e?.canonical_label ?? parsedLabel ?? "?", type: e?.kind ?? "thing", attrs };
}

export async function listPendingReviews(db: SupabaseClient, orgId: string): Promise<ReviewItem[]> {
  const { data, error } = await db
    .from("knowledge_reviews")
    .select("id, kind, status, confidence, impact, source_entity_id, target_entity_id, old_fact_id, new_fact_id, item_id, detail, created_at")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("impact", { ascending: false })
    .order("confidence", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const rows = (data as ReviewRow[] | null) ?? [];
  if (rows.length === 0) return [];

  // Pull the org's entities + facts once (small at individual scale).
  const [{ data: ents }, { data: facts }] = await Promise.all([
    db.from("entities").select("id, canonical_label, kind, natural_keys").eq("org_id", orgId),
    db.from("facts").select("id, subject_entity_id, object_entity_id, predicate, value_text, value_num, value_date, unit, confidence, source_item_id, valid_to").eq("org_id", orgId).limit(5000),
  ]);
  const entMap = new Map<string, EntityLite>((ents as EntityLite[] | null ?? []).map((e) => [e.id, e]));
  const factList = (facts as FactLite[] | null) ?? [];
  const factMap = new Map<string, FactLite>(factList.map((f) => [f.id, f]));
  const label = (id: string) => entMap.get(id)?.canonical_label ?? "?";

  // Edge counts per entity (subject or object references).
  const edges = new Map<string, number>();
  for (const f of factList) {
    edges.set(f.subject_entity_id, (edges.get(f.subject_entity_id) ?? 0) + 1);
    if (f.object_entity_id) edges.set(f.object_entity_id, (edges.get(f.object_entity_id) ?? 0) + 1);
  }

  // Targeted lookups: conflict sources + extraction items.
  const factIds = rows.flatMap((r) => [r.old_fact_id, r.new_fact_id]).filter(Boolean) as string[];
  const itemIds = rows.map((r) => r.item_id).filter(Boolean) as string[];
  const srcCount = new Map<string, number>();
  const srcSnippet = new Map<string, string>();
  if (factIds.length) {
    const { data: fs } = await db.from("fact_sources").select("fact_id, snippet").in("fact_id", factIds);
    for (const s of (fs as { fact_id: string; snippet: string | null }[] | null) ?? []) {
      srcCount.set(s.fact_id, (srcCount.get(s.fact_id) ?? 0) + 1);
      if (s.snippet && !srcSnippet.has(s.fact_id)) srcSnippet.set(s.fact_id, s.snippet);
    }
  }
  const itemMap = new Map<string, { sender: string | null; channel: string | null; body_preview: string | null }>();
  if (itemIds.length) {
    const { data: its } = await db.from("items").select("id, sender, channel, body_preview").in("id", itemIds);
    for (const it of (its as { id: string; sender: string | null; channel: string | null; body_preview: string | null }[] | null) ?? [])
      itemMap.set(it.id, it);
  }

  const out: ReviewItem[] = [];
  for (const r of rows) {
    const base = { id: r.id, confidence: r.confidence, impact: r.impact, createdAt: r.created_at };
    if (r.kind === "entity_merge" && r.target_entity_id) {
      const src = r.source_entity_id ? entMap.get(r.source_entity_id) : undefined;
      const tgt = entMap.get(r.target_entity_id);
      out.push({
        ...base,
        kind: "entity_merge",
        parsed: entitySide(src, r.source_entity_id ? edges.get(r.source_entity_id) ?? 0 : 0, r.detail.parsedLabel as string),
        canonical: entitySide(tgt, edges.get(r.target_entity_id) ?? 0),
        reason: (r.detail.reason as string) || "Similar name and overlapping identifiers.",
      });
    } else if (r.kind === "fact_conflict" && r.old_fact_id && r.new_fact_id) {
      const oldF = factMap.get(r.old_fact_id);
      const newF = factMap.get(r.new_fact_id);
      out.push({
        ...base,
        kind: "fact_conflict",
        subject: newF ? label(newF.subject_entity_id) : "?",
        field: (r.detail.predicate as string) || newF?.predicate || "value",
        was: oldF ? factValue(oldF, label).v : "?",
        now: newF ? factValue(newF, label).v : "?",
        wasSource: `${srcCount.get(r.old_fact_id) ?? 1} source${(srcCount.get(r.old_fact_id) ?? 1) === 1 ? "" : "s"}`,
        nowSource: `${srcCount.get(r.new_fact_id) ?? 1} source${(srcCount.get(r.new_fact_id) ?? 1) === 1 ? "" : "s"}`,
        note: srcSnippet.get(r.new_fact_id) || "A newer message restated this value.",
      });
    } else if (r.kind === "extraction" && r.item_id) {
      const it = itemMap.get(r.item_id);
      const mine = factList.filter((f) => f.source_item_id === r.item_id && f.valid_to === null);
      const entSet = new Map<string, { label: string; type: string }>();
      const rf: ReviewFact[] = mine.map((f) => {
        const val = factValue(f, label);
        const subj = entMap.get(f.subject_entity_id);
        if (subj) entSet.set(subj.id, { label: subj.canonical_label, type: subj.kind });
        if (f.object_entity_id) { const o = entMap.get(f.object_entity_id); if (o) entSet.set(o.id, { label: o.canonical_label, type: o.kind }); }
        return { s: label(f.subject_entity_id), p: f.predicate, v: val.v, c: f.confidence ?? 1, ref: val.ref };
      });
      out.push({
        ...base,
        kind: "extraction",
        from: it?.sender ?? "a message",
        channel: it?.channel ?? "other",
        snippet: (r.detail.snippet as string) || it?.body_preview || "",
        entities: [...entSet.values()],
        facts: rf,
      });
    }
  }
  return out;
}

/* ------------------------------ mutations -------------------------------- */

interface FullRow extends ReviewRow { org_id: string }

async function loadPending(db: SupabaseClient, orgId: string, id: string): Promise<FullRow | null> {
  const { data, error } = await db
    .from("knowledge_reviews").select("*").eq("org_id", orgId).eq("id", id).eq("status", "pending").maybeSingle();
  if (error) throw error;
  return (data as FullRow | null) ?? null;
}

/** Accept: apply the merge / confirm the conflict / confirm the extraction. */
export async function acceptReview(db: SupabaseClient, orgId: string, id: string): Promise<void> {
  const r = await loadPending(db, orgId, id);
  if (!r) return;
  if (r.kind === "entity_merge" && r.source_entity_id && r.target_entity_id) {
    await mergeEntities(db, orgId, r.source_entity_id, r.target_entity_id);
  }
  // fact_conflict + extraction: already applied to the store — accept = confirm.
  await db.from("knowledge_reviews").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", id);
}

/** Reject: keep entities separate / revert a conflict / retract an extraction. */
export async function rejectReview(db: SupabaseClient, orgId: string, id: string): Promise<void> {
  const r = await loadPending(db, orgId, id);
  if (!r) return;

  if (r.kind === "fact_conflict" && r.old_fact_id && r.new_fact_id) {
    const now = new Date().toISOString();
    await db.from("facts").update({ valid_to: now }).eq("id", r.new_fact_id);
    await db.from("facts").update({ valid_to: null, superseded_by: null }).eq("id", r.old_fact_id);
  } else if (r.kind === "extraction" && r.item_id) {
    // Retract this message's contribution: drop its provenance, then delete any
    // fact left with no remaining source (corroborated facts survive).
    await db.from("fact_sources").delete().eq("org_id", orgId).eq("source_item_id", r.item_id);
    const { data: mine } = await db.from("facts").select("id").eq("org_id", orgId).eq("source_item_id", r.item_id);
    const ids = (mine as { id: string }[] | null ?? []).map((f) => f.id);
    if (ids.length) {
      const { data: remaining } = await db.from("fact_sources").select("fact_id").in("fact_id", ids);
      const kept = new Set((remaining as { fact_id: string }[] | null ?? []).map((s) => s.fact_id));
      const orphans = ids.filter((fid) => !kept.has(fid));
      if (orphans.length) await db.from("facts").delete().in("id", orphans);
    }
  }
  // entity_merge: nothing was merged (only proposed) — just mark rejected.
  await db.from("knowledge_reviews").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", id);
}
