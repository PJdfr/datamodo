import type { SupabaseClient } from "@supabase/supabase-js";
import { proposeAgentRows } from "./datasets";

// Sheet sync engine. An external sheet is pulled and reconciled against the
// table's current rows; the difference is proposed (never written directly),
// so it lands in the same review + conflict UI as agent data. That gives us
// "ask me before overwriting my edits" for free — a proposed update to a row
// the user hand-edited is flagged as a conflict by the existing model.

/** The label sync proposals are attributed to in the review UI. */
export const SHEET_SOURCE_NAME = "Google Sheets";

export interface SheetLink {
  id: string;
  dataset_id: string;
  org_id: string;
  source_kind: string;
  source_ref: string | null;
  key_column: string;
  last_synced_at: string | null;
}

/** Normalize a cell value for key matching (trimmed, case-insensitive string). */
function normKey(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim().toLowerCase();
}

/**
 * Pure reconcile: match each incoming sheet row to an existing table row by the
 * value in `keyColumn`. Unmatched rows are additions; matched rows whose values
 * differ become updates (carrying the merged row so accepting replaces cleanly).
 * Rows with a blank key are always treated as additions (we can't match them).
 */
export function reconcile(
  existing: { id: string; data: Record<string, unknown> }[],
  incoming: Record<string, unknown>[],
  keyColumn: string,
): {
  adds: Record<string, unknown>[];
  updates: { targetRowId: string; data: Record<string, unknown> }[];
} {
  const byKey = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const r of existing) {
    const k = normKey(r.data?.[keyColumn]);
    if (k !== "") byKey.set(k, r);
  }

  const adds: Record<string, unknown>[] = [];
  const updates: { targetRowId: string; data: Record<string, unknown> }[] = [];
  for (const row of incoming) {
    const k = normKey(row[keyColumn]);
    const match = k === "" ? undefined : byKey.get(k);
    if (!match) {
      adds.push(row);
      continue;
    }
    const merged = { ...match.data, ...row };
    if (JSON.stringify(merged) !== JSON.stringify(match.data)) {
      updates.push({ targetRowId: match.id, data: merged });
    }
  }
  return { adds, updates };
}

/** The link for a dataset, or null if it isn't synced to a sheet yet. */
export async function getSheetLink(
  db: SupabaseClient,
  datasetId: string,
): Promise<SheetLink | null> {
  const { data, error } = await db
    .from("sheet_links")
    .select("id, dataset_id, org_id, source_kind, source_ref, key_column, last_synced_at")
    .eq("dataset_id", datasetId)
    .maybeSingle();
  if (error) throw error;
  return (data as SheetLink | null) ?? null;
}

export async function createSheetLink(
  db: SupabaseClient,
  input: {
    datasetId: string;
    orgId: string;
    keyColumn: string;
    sourceKind?: string;
    sourceRef?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  const { error } = await db.from("sheet_links").insert({
    dataset_id: input.datasetId,
    org_id: input.orgId,
    key_column: input.keyColumn,
    source_kind: input.sourceKind ?? "upload",
    source_ref: input.sourceRef ?? null,
    created_by: input.createdBy ?? null,
    last_synced_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function touchSheetLink(db: SupabaseClient, datasetId: string): Promise<void> {
  const { error } = await db
    .from("sheet_links")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("dataset_id", datasetId);
  if (error) throw error;
}

/** Accepted rows (with ids) for reconcile — mirrors listAcceptedRows but keeps ids. */
async function acceptedRowsWithIds(
  db: SupabaseClient,
  datasetId: string,
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const { data, error } = await db
    .from("dataset_rows")
    .select("id, data")
    .eq("dataset_id", datasetId)
    .eq("status", "accepted")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { id: string; data: Record<string, unknown> }[]).map((r) => ({
    id: r.id,
    data: r.data ?? {},
  }));
}

/**
 * Pull an incoming snapshot into the table as reviewable proposals. Returns how
 * many rows would be added / changed so the UI can report the sync result.
 */
export async function syncSnapshotAsProposals(
  db: SupabaseClient,
  orgId: string,
  datasetId: string,
  incoming: Record<string, unknown>[],
  keyColumn: string,
): Promise<{ added: number; changed: number }> {
  const existing = await acceptedRowsWithIds(db, datasetId);
  const { adds, updates } = reconcile(existing, incoming, keyColumn);
  await proposeAgentRows(db, orgId, datasetId, SHEET_SOURCE_NAME, adds, updates);
  await touchSheetLink(db, datasetId);
  return { added: adds.length, changed: updates.length };
}
