import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DatasetColumn,
  DatasetRecord,
  DatasetView,
} from "./types";

// Data access for datasets + their rows. Like agents.ts, all reads/writes go
// through the caller's authenticated client and are gated by RLS.

/** List datasets in an org, enriched with owning-agent name + row counts. */
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

  // Count rows per dataset in one query, then fold into the views.
  const { data: rowRefs, error: countErr } = await db
    .from("dataset_rows")
    .select("dataset_id")
    .eq("org_id", orgId)
    .eq("status", "accepted");
  if (countErr) throw countErr;

  const counts = new Map<string, number>();
  for (const r of (rowRefs ?? []) as { dataset_id: string }[]) {
    counts.set(r.dataset_id, (counts.get(r.dataset_id) ?? 0) + 1);
  }

  return datasets.map((d) => ({
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
    rowCount: counts.get(d.id) ?? 0,
  }));
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
