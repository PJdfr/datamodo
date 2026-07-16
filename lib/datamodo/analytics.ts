import { prisma } from "@/lib/prisma";

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
async function measures(orgId: string, predicate: string, kind?: string): Promise<MeasureFact[]> {
  let subjectFilter: Set<string> | null = null;
  if (kind) {
    const ents = await prisma.entities.findMany({
      where: { org_id: orgId, kind, merged_into: null },
      select: { id: true },
    });
    subjectFilter = new Set(ents.map((e) => e.id));
  }
  const data = await prisma.facts.findMany({
    where: { org_id: orgId, predicate, valid_to: null },
    select: { subject_entity_id: true, value_num: true },
  });
  return data
    .map((f) => ({ subject_entity_id: f.subject_entity_id, value_num: f.value_num == null ? null : Number(f.value_num) }))
    .filter((f) => f.value_num != null && (!subjectFilter || subjectFilter.has(f.subject_entity_id)));
}

export interface AggRow { group: string; value: number; count: number }

/**
 * Aggregate a numeric predicate (the "measure"), optionally grouped by another
 * predicate of the same subject (a value or a relationship → grouped by target).
 * e.g. sum "amount" of invoices grouped by "issued_by" → total per vendor.
 */
export async function aggregate(
  orgId: string,
  o: { measure: string; op?: AggOp; groupBy?: string; kind?: string },
): Promise<{ op: AggOp; total: number; rows: AggRow[] }> {
  const op = o.op ?? "sum";
  const ms = await measures(orgId, o.measure, o.kind);

  const groupOf = new Map<string, string>();
  if (o.groupBy) {
    const gf = await prisma.facts.findMany({
      where: { org_id: orgId, predicate: o.groupBy, valid_to: null },
      select: { subject_entity_id: true, object_entity_id: true, value_text: true, value_num: true, value_date: true },
    });
    const gfacts: GroupFact[] = gf.map((g) => ({
      subject_entity_id: g.subject_entity_id,
      object_entity_id: g.object_entity_id,
      value_text: g.value_text,
      value_num: g.value_num == null ? null : Number(g.value_num),
      value_date: g.value_date == null ? null : g.value_date.toISOString().slice(0, 10),
    }));
    const objIds = [...new Set(gfacts.map((g) => g.object_entity_id).filter(Boolean) as string[])];
    const labels = new Map<string, string>();
    if (objIds.length) {
      const objs = await prisma.entities.findMany({
        where: { id: { in: objIds } },
        select: { id: true, canonical_label: true },
      });
      for (const o2 of objs) labels.set(o2.id, o2.canonical_label);
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
  orgId: string,
  o: { measure: string; date: string; op?: AggOp; kind?: string },
): Promise<SeriesPoint[]> {
  const op = o.op ?? "sum";
  const ms = await measures(orgId, o.measure, o.kind);
  const numOf = new Map(ms.map((m) => [m.subject_entity_id, m.value_num as number]));
  const df = await prisma.facts.findMany({
    where: { org_id: orgId, predicate: o.date, valid_to: null },
    select: { subject_entity_id: true, value_date: true },
  });
  const buckets = new Map<string, number[]>();
  for (const d of df) {
    const valueDate = d.value_date == null ? null : d.value_date.toISOString().slice(0, 10);
    if (!valueDate || !numOf.has(d.subject_entity_id)) continue;
    const month = valueDate.slice(0, 7);
    if (!buckets.has(month)) buckets.set(month, []);
    buckets.get(month)!.push(numOf.get(d.subject_entity_id)!);
  }
  return [...buckets.entries()]
    .map(([month, nums]) => ({ month, value: applyOp(op, nums), count: nums.length }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface MeasureOption { predicate: string; label: string; count: number }
export interface FactSchema { numeric: MeasureOption[]; groupBy: MeasureOption[] }

const humanize = (p: string) => p.replace(/_/g, " ");

/** Discover which predicates can be charted: `numeric` = predicates with numeric
 *  values (measures to sum/avg), `groupBy` = relationship or categorical-text
 *  predicates (axes to break a measure down by). Lets the Insights UI offer the
 *  user's OWN measures instead of hardcoding invoice fields. */
export async function listMeasures(orgId: string): Promise<FactSchema> {
  const data = await prisma.facts.findMany({
    where: { org_id: orgId, valid_to: null },
    select: { predicate: true, value_num: true, object_entity_id: true, value_text: true },
    take: 20000,
  });
  const numeric = new Map<string, number>();
  const groupable = new Map<string, number>();
  for (const f of data) {
    if (f.value_num != null) numeric.set(f.predicate, (numeric.get(f.predicate) ?? 0) + 1);
    if (f.object_entity_id || (f.value_text != null && f.value_text !== "")) groupable.set(f.predicate, (groupable.get(f.predicate) ?? 0) + 1);
  }
  const toOpts = (m: Map<string, number>): MeasureOption[] =>
    [...m.entries()].map(([predicate, count]) => ({ predicate, label: humanize(predicate), count })).sort((a, b) => b.count - a.count);
  return { numeric: toOpts(numeric), groupBy: toOpts(groupable) };
}

export interface FactMetrics { entitiesByKind: { kind: string; count: number }[]; totalEntities: number; totalFacts: number }

/** Headline counts across the knowledge layer. */
export async function factMetrics(orgId: string): Promise<FactMetrics> {
  const ents = await prisma.entities.findMany({
    where: { org_id: orgId, merged_into: null },
    select: { kind: true },
  });
  const byKind = new Map<string, number>();
  for (const e of ents) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  const count = await prisma.facts.count({ where: { org_id: orgId, valid_to: null } });
  return {
    entitiesByKind: [...byKind.entries()].map(([kind, c]) => ({ kind, count: c })).sort((a, b) => b.count - a.count),
    totalEntities: ents.length,
    totalFacts: count,
  };
}

/** DB shell for the ontology-health telemetry (GRAPH_PIPELINE.md P2): load
 *  every fact (superseded included — first-seen dates need them) projected to
 *  the pure core's shape. Capped; at personal scale this is small. */
export async function loadHealthFacts(orgId: string): Promise<import("./ontology-health").HealthFact[]> {
  const rows = await prisma.$queryRaw<
    { predicate: string; kind: string; created_at: Date; current: boolean; value_type: string; unit: string | null }[]
  >`
    SELECT f.predicate, e.kind, f.created_at, (f.valid_to IS NULL) AS current,
           CASE WHEN f.object_entity_id IS NOT NULL THEN 'entity'
                WHEN f.value_num IS NOT NULL THEN 'number'
                WHEN f.value_date IS NOT NULL THEN 'date'
                ELSE 'text' END AS value_type,
           f.unit
      FROM facts f
      JOIN entities e ON e.id = f.subject_entity_id
     WHERE f.org_id = ${orgId}::uuid
     LIMIT 20000`;
  return rows.map((r) => ({
    predicate: r.predicate,
    subjectKind: r.kind,
    createdAt: r.created_at,
    current: r.current,
    valueType: r.value_type as import("./ontology-health").HealthFact["valueType"],
    unit: r.unit,
  }));
}
