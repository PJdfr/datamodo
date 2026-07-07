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
