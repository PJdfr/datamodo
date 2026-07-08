import type { SupabaseClient } from "@supabase/supabase-js";

// ANALYTICS over the canonical facts — the "numbers" answer from the research.
// Facts live in a relational store, so aggregation is plain grouped arithmetic
// over numeric facts (subject-joined to a grouping predicate), NOT graph
// traversal. At per-user scale we pull the relevant current facts and aggregate
// in memory. DuckDB is the drop-in scale path: same shape of query, attached to
// Postgres or over Parquet snapshots — swap in when fact volume demands columnar
// speed. Kept behind these functions so callers don't change when that happens.

export type AggOp = "sum" | "avg" | "min" | "max" | "count";

const round2 = (n: number) => Math.round(n * 100) / 100;

function applyOp(op: AggOp, nums: number[]): number {
  if (nums.length === 0) return 0;
  switch (op) {
    case "count": return nums.length;
    case "sum": return round2(nums.reduce((a, b) => a + b, 0));
    case "avg": return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
  }
}

interface MeasureFact { subject_entity_id: string; value_num: number | null }
interface GroupFact { subject_entity_id: string; object_entity_id: string | null; value_text: string | null; value_num: number | null; value_date: string | null }

/** Current (non-superseded) numeric facts for a measure predicate, optionally
 *  restricted to subjects of a given entity kind. */
async function measures(admin: SupabaseClient, orgId: string, predicate: string, kind?: string): Promise<MeasureFact[]> {
  let subjectFilter: Set<string> | null = null;
  if (kind) {
    const { data: ents } = await admin.from("entities").select("id").eq("org_id", orgId).eq("kind", kind).is("merged_into", null);
    subjectFilter = new Set((ents as { id: string }[] | null ?? []).map((e) => e.id));
  }
  const { data } = await admin
    .from("facts").select("subject_entity_id, value_num")
    .eq("org_id", orgId).eq("predicate", predicate).is("valid_to", null);
  return (data as MeasureFact[] | null ?? []).filter((f) => f.value_num != null && (!subjectFilter || subjectFilter.has(f.subject_entity_id)));
}

export interface AggRow { group: string; value: number; count: number }

/**
 * Aggregate a numeric predicate (the "measure"), optionally grouped by another
 * predicate of the same subject (a value or a relationship → grouped by target).
 * e.g. sum "amount" of invoices grouped by "issued_by" → total per vendor.
 */
export async function aggregate(
  admin: SupabaseClient,
  orgId: string,
  o: { measure: string; op?: AggOp; groupBy?: string; kind?: string },
): Promise<{ op: AggOp; total: number; rows: AggRow[] }> {
  const op = o.op ?? "sum";
  const ms = await measures(admin, orgId, o.measure, o.kind);

  const groupOf = new Map<string, string>();
  if (o.groupBy) {
    const { data: gf } = await admin
      .from("facts").select("subject_entity_id, object_entity_id, value_text, value_num, value_date")
      .eq("org_id", orgId).eq("predicate", o.groupBy).is("valid_to", null);
    const gfacts = (gf as GroupFact[] | null) ?? [];
    const objIds = [...new Set(gfacts.map((g) => g.object_entity_id).filter(Boolean) as string[])];
    const labels = new Map<string, string>();
    if (objIds.length) {
      const { data: objs } = await admin.from("entities").select("id, canonical_label").in("id", objIds);
      for (const o2 of (objs as { id: string; canonical_label: string }[] | null ?? [])) labels.set(o2.id, o2.canonical_label);
    }
    for (const g of gfacts) {
      const v = g.object_entity_id ? (labels.get(g.object_entity_id) ?? "?")
        : g.value_text ?? (g.value_num != null ? String(g.value_num) : g.value_date ?? "—");
      groupOf.set(g.subject_entity_id, v);
    }
  }

  const buckets = new Map<string, number[]>();
  for (const m of ms) {
    const key = o.groupBy ? (groupOf.get(m.subject_entity_id) ?? "(unspecified)") : "All";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(m.value_num as number);
  }
  const rows = [...buckets.entries()]
    .map(([group, nums]) => ({ group, value: applyOp(op, nums), count: nums.length }))
    .sort((a, b) => b.value - a.value);
  return { op, total: applyOp(op, ms.map((m) => m.value_num as number)), rows };
}

export interface SeriesPoint { month: string; value: number; count: number }

/** Monthly time series: a numeric measure bucketed by a date predicate of the
 *  same subject. e.g. "amount" invoiced per month by "due_date". */
export async function monthlySeries(
  admin: SupabaseClient,
  orgId: string,
  o: { measure: string; date: string; op?: AggOp; kind?: string },
): Promise<SeriesPoint[]> {
  const op = o.op ?? "sum";
  const ms = await measures(admin, orgId, o.measure, o.kind);
  const numOf = new Map(ms.map((m) => [m.subject_entity_id, m.value_num as number]));
  const { data: df } = await admin
    .from("facts").select("subject_entity_id, value_date")
    .eq("org_id", orgId).eq("predicate", o.date).is("valid_to", null);
  const buckets = new Map<string, number[]>();
  for (const d of (df as { subject_entity_id: string; value_date: string | null }[] | null ?? [])) {
    if (!d.value_date || !numOf.has(d.subject_entity_id)) continue;
    const month = d.value_date.slice(0, 7);
    if (!buckets.has(month)) buckets.set(month, []);
    buckets.get(month)!.push(numOf.get(d.subject_entity_id)!);
  }
  return [...buckets.entries()]
    .map(([month, nums]) => ({ month, value: applyOp(op, nums), count: nums.length }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface FactMetrics { entitiesByKind: { kind: string; count: number }[]; totalEntities: number; totalFacts: number }

/** Headline counts across the knowledge layer. */
export async function factMetrics(admin: SupabaseClient, orgId: string): Promise<FactMetrics> {
  const { data: ents } = await admin.from("entities").select("kind").eq("org_id", orgId).is("merged_into", null);
  const byKind = new Map<string, number>();
  for (const e of (ents as { kind: string }[] | null ?? [])) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  const { count } = await admin.from("facts").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("valid_to", null);
  return {
    entitiesByKind: [...byKind.entries()].map(([kind, c]) => ({ kind, count: c })).sort((a, b) => b.count - a.count),
    totalEntities: (ents as unknown[] | null ?? []).length,
    totalFacts: count ?? 0,
  };
}
