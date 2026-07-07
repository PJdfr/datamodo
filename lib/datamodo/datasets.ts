import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DatasetColumn,
  DatasetRecord,
  DatasetRowRecord,
  DatasetView,
} from "./types";

// Data access for datasets + their rows. Like agents.ts, all reads/writes go
// through the caller's authenticated client and are gated by RLS.

/** List datasets in an org, enriched with owning-agent name + their rows. */
export async function listDatasets(
  db: SupabaseClient,
  orgId: string,
): Promise<DatasetView[]> {
  const { data, error } = await db
    .from("datasets")
    .select("*, agents ( name )")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  type Joined = DatasetRecord & { agents: { name: string } | null };
  const datasets = (data ?? []) as unknown as Joined[];
  if (datasets.length === 0) return [];

  // Load all accepted rows for the org in one query, then group per dataset.
  const { data: rowData, error: rowErr } = await db
    .from("dataset_rows")
    .select("id, dataset_id, data")
    .eq("org_id", orgId)
    .eq("status", "accepted")
    .order("created_at", { ascending: true });
  if (rowErr) throw rowErr;

  const rowsByDataset = new Map<string, DatasetRowRecord[]>();
  for (const r of (rowData ?? []) as { id: string; dataset_id: string; data: Record<string, unknown> }[]) {
    const arr = rowsByDataset.get(r.dataset_id) ?? [];
    arr.push({ id: r.id, data: r.data ?? {} });
    rowsByDataset.set(r.dataset_id, arr);
  }

  return datasets.map((d) => {
    const rows = rowsByDataset.get(d.id) ?? [];
    return {
      id: d.id,
      org_id: d.org_id,
      agent_id: d.agent_id,
      name: d.name,
      description: d.description,
      columns: Array.isArray(d.columns) ? (d.columns as DatasetColumn[]) : [],
      created_by: d.created_by,
      created_at: d.created_at,
      updated_at: d.updated_at,
      agentName: d.agents?.name ?? null,
      rowCount: rows.length,
      rows,
    };
  });
}

/** Fetch a single dataset by id (RLS returns null when not visible). */
export async function getDataset(
  db: SupabaseClient,
  datasetId: string,
): Promise<DatasetRecord | null> {
  const { data, error } = await db
    .from("datasets")
    .select("*")
    .eq("id", datasetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as DatasetRecord;
  return { ...d, columns: Array.isArray(d.columns) ? d.columns : [] };
}

/** Accepted rows for a dataset, oldest first — the exportable/live rows. */
export async function listAcceptedRows(
  db: SupabaseClient,
  datasetId: string,
): Promise<{ data: Record<string, unknown> }[]> {
  const { data, error } = await db
    .from("dataset_rows")
    .select("data")
    .eq("dataset_id", datasetId)
    .eq("status", "accepted")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { data: Record<string, unknown> }[];
}

export async function createDataset(
  db: SupabaseClient,
  orgId: string,
  createdBy: string,
  input: {
    name: string;
    description?: string | null;
    columns?: DatasetColumn[];
    agentId?: string | null;
  },
): Promise<DatasetRecord> {
  const name = input.name?.trim();
  if (!name) throw new Error("Dataset name is required");

  const { data, error } = await db
    .from("datasets")
    .insert({
      org_id: orgId,
      created_by: createdBy,
      agent_id: input.agentId ?? null,
      name,
      description: input.description?.trim() || null,
      columns: input.columns ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as DatasetRecord;
}

export async function renameDataset(
  db: SupabaseClient,
  datasetId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Dataset name is required");
  const { error } = await db.from("datasets").update({ name: trimmed }).eq("id", datasetId);
  if (error) throw error;
}

export async function deleteDataset(db: SupabaseClient, datasetId: string): Promise<void> {
  const { error } = await db.from("datasets").delete().eq("id", datasetId);
  if (error) throw error;
}

/** Replace a dataset's whole column set (used for retype/relabel/reorder). */
export async function setColumns(
  db: SupabaseClient,
  datasetId: string,
  columns: DatasetColumn[],
): Promise<void> {
  const { error } = await db.from("datasets").update({ columns }).eq("id", datasetId);
  if (error) throw error;
}

/**
 * Add a column and backfill every existing row with `defaultValue` (in one
 * jsonb update). Keys are derived from the label and de-duplicated.
 */
export async function addColumn(
  db: SupabaseClient,
  datasetId: string,
  column: { label: string; type: string; defaultValue?: unknown },
): Promise<void> {
  const dataset = await getDataset(db, datasetId);
  if (!dataset) throw new Error("Table not found");

  const label = column.label.trim();
  if (!label) throw new Error("Column name is required");

  const existingKeys = new Set(dataset.columns.map((c) => c.key));
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "col";
  let key = base;
  let n = 2;
  while (existingKeys.has(key)) key = `${base}_${n++}`;

  const columns = [...dataset.columns, { key, label, type: column.type || "text" }];
  await setColumns(db, datasetId, columns);

  // Backfill existing rows with the default value for the new column.
  const def = column.defaultValue ?? null;
  const { data: rows, error } = await db
    .from("dataset_rows")
    .select("id, data")
    .eq("dataset_id", datasetId);
  if (error) throw error;
  for (const r of (rows ?? []) as { id: string; data: Record<string, unknown> }[]) {
    if (!(key in (r.data ?? {}))) {
      await db.from("dataset_rows").update({ data: { ...r.data, [key]: def } }).eq("id", r.id);
    }
  }
}

/** Remove a column definition and strip its key from every row. */
export async function removeColumn(
  db: SupabaseClient,
  datasetId: string,
  key: string,
): Promise<void> {
  const dataset = await getDataset(db, datasetId);
  if (!dataset) throw new Error("Table not found");
  await setColumns(db, datasetId, dataset.columns.filter((c) => c.key !== key));

  const { data: rows } = await db.from("dataset_rows").select("id, data").eq("dataset_id", datasetId);
  for (const r of (rows ?? []) as { id: string; data: Record<string, unknown> }[]) {
    if (key in (r.data ?? {})) {
      const next = { ...r.data };
      delete next[key];
      await db.from("dataset_rows").update({ data: next }).eq("id", r.id);
    }
  }
}

/** Insert one structured row into a dataset. */
export async function insertRow(
  db: SupabaseClient,
  orgId: string,
  datasetId: string,
  data: Record<string, unknown>,
  opts: { createdBy?: string; sourceItemId?: string | null; status?: "accepted" | "proposed" } = {},
): Promise<void> {
  const { error } = await db.from("dataset_rows").insert({
    org_id: orgId,
    dataset_id: datasetId,
    data,
    status: opts.status ?? "accepted",
    source_item_id: opts.sourceItemId ?? null,
    created_by: opts.createdBy ?? null,
  });
  if (error) throw error;
}

export async function updateRow(
  db: SupabaseClient,
  rowId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("dataset_rows").update({ data }).eq("id", rowId);
  if (error) throw error;
}

export async function deleteRow(db: SupabaseClient, rowId: string): Promise<void> {
  const { error } = await db.from("dataset_rows").delete().eq("id", rowId);
  if (error) throw error;
}
