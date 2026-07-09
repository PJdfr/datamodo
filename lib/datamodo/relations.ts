import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatasetRelation } from "./types";

// Data access for explicit table→table relationships. Like the rest of the
// structured layer, every call goes through the caller's authenticated client
// and is gated by org-scoped RLS.

type RawRelation = {
  id: string;
  from_dataset_id: string;
  from_column: string;
  to_dataset_id: string;
  to_column: string;
  label: string | null;
  from_ds: { name: string } | null;
  to_ds: { name: string } | null;
};

/** List an org's relationships, enriched with the two tables' names. */
export async function listRelations(
  db: SupabaseClient,
  orgId: string,
): Promise<DatasetRelation[]> {
  const { data, error } = await db
    .from("dataset_relations")
    .select(
      "id, from_dataset_id, from_column, to_dataset_id, to_column, label, " +
        "from_ds:datasets!dataset_relations_from_dataset_id_fkey ( name ), " +
        "to_ds:datasets!dataset_relations_to_dataset_id_fkey ( name )",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as RawRelation[]).map((r) => ({
    id: r.id,
    fromDatasetId: r.from_dataset_id,
    fromDatasetName: r.from_ds?.name ?? "—",
    fromColumn: r.from_column,
    toDatasetId: r.to_dataset_id,
    toDatasetName: r.to_ds?.name ?? "—",
    toColumn: r.to_column,
    label: r.label,
  }));
}

/** Create a relationship. Validates that both columns exist on their tables and
 *  that it isn't a self/duplicate link. */
export async function createRelation(
  db: SupabaseClient,
  orgId: string,
  input: {
    fromDatasetId: string;
    fromColumn: string;
    toDatasetId: string;
    toColumn: string;
    label?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  const { fromDatasetId, fromColumn, toDatasetId, toColumn } = input;
  if (!fromDatasetId || !toDatasetId) throw new Error("Pick both tables.");
  if (!fromColumn || !toColumn) throw new Error("Pick a column on each table.");
  if (fromDatasetId === toDatasetId) throw new Error("A relationship must link two different tables.");

  // Confirm the columns exist on each table (defends against stale UI).
  const { data: dsRows, error: dsErr } = await db
    .from("datasets")
    .select("id, columns")
    .in("id", [fromDatasetId, toDatasetId]);
  if (dsErr) throw dsErr;
  const byId = new Map(
    ((dsRows ?? []) as { id: string; columns: { key: string }[] }[]).map((d) => [
      d.id,
      new Set((Array.isArray(d.columns) ? d.columns : []).map((c) => c.key)),
    ]),
  );
  if (!byId.get(fromDatasetId)?.has(fromColumn)) throw new Error("That column no longer exists on the source table.");
  if (!byId.get(toDatasetId)?.has(toColumn)) throw new Error("That column no longer exists on the target table.");

  const { error } = await db.from("dataset_relations").insert({
    org_id: orgId,
    from_dataset_id: fromDatasetId,
    from_column: fromColumn,
    to_dataset_id: toDatasetId,
    to_column: toColumn,
    label: input.label?.trim() || null,
    created_by: input.createdBy ?? null,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("That relationship already exists.");
    throw error;
  }
}

export async function deleteRelation(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from("dataset_relations").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Auto-link suggestions: spot two tables that share values in a column pair and
// propose the relationship the user hasn't drawn yet. Pure + deterministic so
// it's unit-testable; the direction points the foreign-key (subset) side at the
// side that contains it.
// ---------------------------------------------------------------------------

export interface RelationSuggestion {
  fromDatasetId: string; fromDatasetName: string; fromColumn: string; fromColumnLabel: string;
  toDatasetId: string; toDatasetName: string; toColumn: string; toColumnLabel: string;
  sample: string[]; // a few overlapping values, for "shares Acme Inc, …"
  overlap: number;  // distinct shared values
  score: number;    // containment 0..1 (share of the from-side found on the to-side)
}

type SuggestDataset = { id: string; name: string; columns: { key: string; label: string; type: string }[] };

// Amounts, dates, and enum/status columns aren't join keys — comparing them is noise.
const LINKABLE_TYPE = (t: string) => !["number", "date", "status", "boolean", "checkbox"].includes((t || "").toLowerCase());
const normVal = (v: unknown) => (v == null ? "" : String(v).trim().toLowerCase());

export function suggestRelations(
  datasets: SuggestDataset[],
  rowsByDataset: Map<string, Record<string, unknown>[]>,
  existing: { fromDatasetId: string; fromColumn: string; toDatasetId: string; toColumn: string }[],
  opts: { limit?: number; minScore?: number; minOverlap?: number } = {},
): RelationSuggestion[] {
  const limit = opts.limit ?? 6;
  const minScore = opts.minScore ?? 0.5;
  const minOverlap = opts.minOverlap ?? 1;

  const linked = new Set<string>();
  for (const r of existing) {
    linked.add(`${r.fromDatasetId}:${r.fromColumn}|${r.toDatasetId}:${r.toColumn}`);
    linked.add(`${r.toDatasetId}:${r.toColumn}|${r.fromDatasetId}:${r.fromColumn}`);
  }

  // Distinct value sets per linkable (dataset, column).
  type Col = { ds: SuggestDataset; col: { key: string; label: string; type: string }; values: Map<string, string> };
  const cols: Col[] = [];
  for (const ds of datasets) {
    const rows = rowsByDataset.get(ds.id) ?? [];
    for (const col of ds.columns) {
      if (!LINKABLE_TYPE(col.type)) continue;
      const values = new Map<string, string>(); // normalized -> a display original
      for (const row of rows) {
        const n = normVal(row[col.key]);
        if (n && !values.has(n)) values.set(n, String(row[col.key]).trim());
      }
      if (values.size >= 2) cols.push({ ds, col, values }); // <2 distinct = no signal
    }
  }

  const out: RelationSuggestion[] = [];
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const A = cols[i], B = cols[j];
      if (A.ds.id === B.ds.id) continue; // never link a table to itself
      const [small, big] = A.values.size <= B.values.size ? [A, B] : [B, A];
      const shared: string[] = [];
      for (const [n, orig] of small.values) if (big.values.has(n)) shared.push(orig);
      if (shared.length < minOverlap) continue;
      const contA = shared.length / A.values.size;
      const contB = shared.length / B.values.size;
      const score = Math.max(contA, contB);
      if (score < minScore) continue;
      const [F, T] = contA >= contB ? [A, B] : [B, A]; // higher containment = foreign-key side
      if (linked.has(`${F.ds.id}:${F.col.key}|${T.ds.id}:${T.col.key}`)) continue;
      out.push({
        fromDatasetId: F.ds.id, fromDatasetName: F.ds.name, fromColumn: F.col.key, fromColumnLabel: F.col.label,
        toDatasetId: T.ds.id, toDatasetName: T.ds.name, toColumn: T.col.key, toColumnLabel: T.col.label,
        sample: shared.slice(0, 3), overlap: shared.length, score,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score || b.overlap - a.overlap).slice(0, limit);
}

/** Fetch the org's datasets + accepted rows + existing links and compute suggestions. */
export async function getRelationSuggestions(db: SupabaseClient, orgId: string): Promise<RelationSuggestion[]> {
  const [{ data: ds }, existing] = await Promise.all([
    db.from("datasets").select("id, name, columns").eq("org_id", orgId),
    listRelations(db, orgId),
  ]);
  const datasets = ((ds ?? []) as { id: string; name: string; columns: SuggestDataset["columns"] | null }[])
    .map((d) => ({ id: d.id, name: d.name, columns: Array.isArray(d.columns) ? d.columns : [] }));
  if (datasets.length < 2) return [];

  const { data: rows } = await db
    .from("dataset_rows").select("dataset_id, data")
    .eq("org_id", orgId).eq("status", "accepted").limit(4000);
  const rowsByDataset = new Map<string, Record<string, unknown>[]>();
  for (const r of ((rows ?? []) as { dataset_id: string; data: Record<string, unknown> | null }[])) {
    const arr = rowsByDataset.get(r.dataset_id) ?? [];
    arr.push(r.data ?? {});
    rowsByDataset.set(r.dataset_id, arr);
  }

  const existingLite = existing.map((e) => ({ fromDatasetId: e.fromDatasetId, fromColumn: e.fromColumn, toDatasetId: e.toDatasetId, toColumn: e.toColumn }));
  return suggestRelations(datasets, rowsByDataset, existingLite);
}
