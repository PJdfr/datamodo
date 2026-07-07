import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DatasetColumn,
  DatasetRecord,
  DatasetRowRecord,
  DatasetView,
  Proposal,
  SnapshotFull,
  SnapshotMeta,
} from "./types";

// Data access for datasets + their rows. Like agents.ts, all reads/writes go
// through the caller's authenticated client and are gated by RLS.

type RawRow = {
  id: string;
  dataset_id: string;
  data: Record<string, unknown>;
  human_edited: boolean;
  status: string;
  proposed_kind: string | null;
  target_row_id: string | null;
  proposed_by: string | null;
  batch_id: string | null;
  created_at: string;
  source_item_id: string | null;
};

/** List datasets in an org, enriched with rows, version history, + proposals. */
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

  // Load every row for the org once (accepted rows + agent proposals).
  const { data: rowData, error: rowErr } = await db
    .from("dataset_rows")
    .select("id, dataset_id, data, human_edited, status, proposed_kind, target_row_id, proposed_by, batch_id, created_at, source_item_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (rowErr) throw rowErr;
  const allRows = (rowData ?? []) as RawRow[];

  // Label proposals with the message/email they were parsed from, when known.
  const sourceIds = [...new Set(allRows.filter((r) => r.status === "proposed" && r.source_item_id).map((r) => r.source_item_id as string))];
  const sourceLabels = new Map<string, string>();
  if (sourceIds.length) {
    const { data: items } = await db
      .from("items")
      .select("id, subject, sender")
      .in("id", sourceIds);
    for (const it of (items ?? []) as { id: string; subject: string | null; sender: string | null }[]) {
      sourceLabels.set(it.id, it.subject?.trim() || it.sender?.trim() || "a message");
    }
  }

  const accepted = new Map<string, DatasetRowRecord[]>();
  const acceptedById = new Map<string, RawRow>();
  const proposedByDataset = new Map<string, RawRow[]>();
  for (const r of allRows) {
    if (r.status === "accepted") {
      const arr = accepted.get(r.dataset_id) ?? [];
      arr.push({ id: r.id, data: r.data ?? {}, humanEdited: r.human_edited });
      accepted.set(r.dataset_id, arr);
      acceptedById.set(r.id, r);
    } else if (r.status === "proposed") {
      const arr = proposedByDataset.get(r.dataset_id) ?? [];
      arr.push(r);
      proposedByDataset.set(r.dataset_id, arr);
    }
  }

  // Version-history metadata (no heavy payloads).
  const { data: snapData, error: snapErr } = await db
    .from("dataset_snapshots")
    .select("id, dataset_id, actor, summary, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (snapErr) throw snapErr;
  const historyByDataset = new Map<string, SnapshotMeta[]>();
  for (const s of (snapData ?? []) as { id: string; dataset_id: string; actor: string; summary: string; created_at: string }[]) {
    const arr = historyByDataset.get(s.dataset_id) ?? [];
    arr.push({ id: s.id, actor: s.actor, summary: s.summary, createdAt: s.created_at });
    historyByDataset.set(s.dataset_id, arr);
  }

  return datasets.map((d) => {
    const rows = accepted.get(d.id) ?? [];
    const proposals: Proposal[] = (proposedByDataset.get(d.id) ?? []).map((p) => {
      const target = p.target_row_id ? acceptedById.get(p.target_row_id) : null;
      return {
        id: p.id,
        kind: p.proposed_kind === "update" ? "update" : "add",
        proposedBy: p.proposed_by ?? "An agent",
        data: p.data ?? {},
        targetRowId: p.target_row_id,
        currentData: target?.data ?? null,
        conflict: !!target && target.human_edited,
        batchId: p.batch_id,
        createdAt: p.created_at,
        sourceLabel: p.source_item_id ? sourceLabels.get(p.source_item_id) ?? null : null,
      };
    });
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
      history: historyByDataset.get(d.id) ?? [],
      proposals,
    };
  });
}

// ---------------------------------------------------------------------------
// Version history: snapshots + restore
// ---------------------------------------------------------------------------

/** Save a full point-in-time copy of a table with a plain-language summary. */
export async function snapshotDataset(
  db: SupabaseClient,
  datasetId: string,
  actor: string,
  summary: string,
): Promise<void> {
  const ds = await getDataset(db, datasetId);
  if (!ds) return;
  const rows = await listAcceptedRows(db, datasetId);
  const { error } = await db.from("dataset_snapshots").insert({
    dataset_id: datasetId,
    org_id: ds.org_id,
    actor,
    summary,
    columns: ds.columns,
    rows,
  });
  if (error) throw error;
}

/** Create an "Original version" checkpoint the first time a table is changed. */
export async function ensureBaseline(db: SupabaseClient, datasetId: string): Promise<void> {
  const { count, error } = await db
    .from("dataset_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("dataset_id", datasetId);
  if (error) throw error;
  if ((count ?? 0) === 0) await snapshotDataset(db, datasetId, "You", "Original version");
}

/** Run a mutation between a baseline check and a post-change checkpoint. */
export async function checkpoint(
  db: SupabaseClient,
  datasetId: string,
  summary: string,
  apply: () => Promise<void>,
  actor = "You",
): Promise<void> {
  await ensureBaseline(db, datasetId);
  await apply();
  await snapshotDataset(db, datasetId, actor, summary);
}

/** Full version history for a table (newest first) with each version's rows +
 *  columns, so the UI can preview a version and diff it against another. */
export async function listSnapshotsFull(
  db: SupabaseClient,
  datasetId: string,
): Promise<SnapshotFull[]> {
  const { data, error } = await db
    .from("dataset_snapshots")
    .select("id, actor, summary, created_at, columns, rows")
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as {
    id: string;
    actor: string;
    summary: string;
    created_at: string;
    columns: DatasetColumn[];
    rows: { data: Record<string, unknown> }[];
  }[]).map((s) => ({
    id: s.id,
    actor: s.actor,
    summary: s.summary,
    createdAt: s.created_at,
    columns: Array.isArray(s.columns) ? s.columns : [],
    rows: Array.isArray(s.rows) ? s.rows : [],
  }));
}

/** Rewind a table to a saved version (its rows + columns), keeping proposals. */
export async function restoreSnapshot(db: SupabaseClient, snapshotId: string): Promise<void> {
  const { data, error } = await db
    .from("dataset_snapshots")
    .select("dataset_id, org_id, columns, rows, created_at")
    .eq("id", snapshotId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Version not found");
  const snap = data as { dataset_id: string; org_id: string; columns: DatasetColumn[]; rows: { data: Record<string, unknown> }[]; created_at: string };

  await db.from("datasets").update({ columns: snap.columns }).eq("id", snap.dataset_id);
  await db.from("dataset_rows").delete().eq("dataset_id", snap.dataset_id).eq("status", "accepted");
  if (snap.rows.length) {
    const insert = snap.rows.map((r) => ({
      dataset_id: snap.dataset_id,
      org_id: snap.org_id,
      data: r.data ?? {},
      status: "accepted" as const,
      origin: "manual",
    }));
    const { error: insErr } = await db.from("dataset_rows").insert(insert);
    if (insErr) throw insErr;
  }
  const when = new Date(snap.created_at).toLocaleString();
  await snapshotDataset(db, snap.dataset_id, "You", `Restored to the version from ${when}`);
}

// ---------------------------------------------------------------------------
// Agent proposals: agents suggest, humans decide
// ---------------------------------------------------------------------------

type ProposalRow = {
  id: string;
  dataset_id: string;
  data: Record<string, unknown>;
  proposed_kind: string | null;
  target_row_id: string | null;
  proposed_by: string | null;
};

/**
 * Queue agent-proposed rows/changes for the user to review. Everything proposed
 * in one call shares a `batch_id` — the chunk the user later accepts/rejects as
 * a unit. `sourceItemId` links the batch to the message/email it came from.
 * Returns the batch id.
 */
export async function proposeAgentRows(
  db: SupabaseClient,
  orgId: string,
  datasetId: string,
  agentName: string,
  adds: Record<string, unknown>[],
  updates: { targetRowId: string; data: Record<string, unknown> }[],
  opts: { sourceItemId?: string | null } = {},
): Promise<string | null> {
  if (!adds.length && !updates.length) return null;
  const batchId = crypto.randomUUID();
  const base = {
    org_id: orgId,
    dataset_id: datasetId,
    status: "proposed" as const,
    origin: "agent",
    proposed_by: agentName,
    batch_id: batchId,
    source_item_id: opts.sourceItemId ?? null,
  };
  const rows = [
    ...adds.map((data) => ({ ...base, data, proposed_kind: "add" })),
    ...updates.map((u) => ({ ...base, data: u.data, proposed_kind: "update", target_row_id: u.targetRowId })),
  ];
  const { error } = await db.from("dataset_rows").insert(rows);
  if (error) throw error;
  return batchId;
}

/** Apply one proposal row: add the new row, or write the update onto its target. */
async function applyProposalRow(db: SupabaseClient, p: ProposalRow): Promise<"add" | "update"> {
  if (p.proposed_kind === "update" && p.target_row_id) {
    await db.from("dataset_rows").update({ data: p.data, origin: "agent", human_edited: false }).eq("id", p.target_row_id);
    await db.from("dataset_rows").delete().eq("id", p.id);
    return "update";
  }
  await db.from("dataset_rows").update({ status: "accepted", proposed_kind: null, target_row_id: null }).eq("id", p.id);
  return "add";
}

const PROPOSAL_COLS = "id, dataset_id, data, proposed_kind, target_row_id, proposed_by";

/** Apply a single proposal. */
export async function acceptProposal(db: SupabaseClient, proposalId: string): Promise<{ datasetId: string; summary: string; actor: string } | null> {
  const { data, error } = await db.from("dataset_rows").select(PROPOSAL_COLS).eq("id", proposalId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const p = data as ProposalRow;
  const actor = p.proposed_by ?? "An agent";
  const kind = await applyProposalRow(db, p);
  return { datasetId: p.dataset_id, summary: kind === "update" ? `Applied ${actor}'s change` : `Added ${actor}'s row`, actor };
}

export async function rejectProposal(db: SupabaseClient, proposalId: string): Promise<void> {
  const { error } = await db.from("dataset_rows").delete().eq("id", proposalId);
  if (error) throw error;
}

/** Accept a whole chunk — every proposal in a batch — in one go. */
export async function acceptBatch(db: SupabaseClient, batchId: string): Promise<{ datasetId: string; summary: string; actor: string } | null> {
  const { data, error } = await db
    .from("dataset_rows")
    .select(PROPOSAL_COLS)
    .eq("batch_id", batchId)
    .eq("status", "proposed");
  if (error) throw error;
  const props = (data ?? []) as ProposalRow[];
  if (!props.length) return null;

  const actor = props[0].proposed_by ?? "An agent";
  let adds = 0;
  let updates = 0;
  for (const p of props) {
    const kind = await applyProposalRow(db, p);
    if (kind === "update") updates++; else adds++;
  }
  const parts: string[] = [];
  if (adds) parts.push(`${adds} row${adds === 1 ? "" : "s"} added`);
  if (updates) parts.push(`${updates} change${updates === 1 ? "" : "s"} applied`);
  return { datasetId: props[0].dataset_id, summary: `Accepted ${actor}'s update — ${parts.join(", ")}`, actor };
}

/** Reject (discard) a whole chunk. */
export async function rejectBatch(db: SupabaseClient, batchId: string): Promise<void> {
  const { error } = await db.from("dataset_rows").delete().eq("batch_id", batchId).eq("status", "proposed");
  if (error) throw error;
}

/** One dataset's slice of a bulk accept — so the caller can snapshot each table
 *  it touched exactly once, attributed to the agent(s) involved. */
export interface BulkAcceptResult {
  datasetId: string;
  summary: string;
  actor: string;
}

/**
 * Accept an arbitrary set of proposals (across any tables/agents/batches). This
 * is the one primitive the Versioning surface uses for every "accept" flavour —
 * single, multi-select, whole agent, whole table, or merge-all — by passing the
 * right id set. Returns one result per affected dataset for checkpointing.
 */
export async function acceptProposals(
  db: SupabaseClient,
  ids: string[],
): Promise<BulkAcceptResult[]> {
  if (!ids.length) return [];
  const { data, error } = await db
    .from("dataset_rows")
    .select(PROPOSAL_COLS)
    .in("id", ids)
    .eq("status", "proposed");
  if (error) throw error;
  const props = (data ?? []) as ProposalRow[];
  if (!props.length) return [];

  const perDataset = new Map<string, { adds: number; updates: number; actors: Set<string> }>();
  for (const p of props) {
    const kind = await applyProposalRow(db, p);
    const agg = perDataset.get(p.dataset_id) ?? { adds: 0, updates: 0, actors: new Set<string>() };
    if (kind === "update") agg.updates++; else agg.adds++;
    agg.actors.add(p.proposed_by ?? "An agent");
    perDataset.set(p.dataset_id, agg);
  }

  return [...perDataset.entries()].map(([datasetId, agg]) => {
    const actor = agg.actors.size === 1 ? [...agg.actors][0] : "Agents";
    const parts: string[] = [];
    if (agg.adds) parts.push(`${agg.adds} row${agg.adds === 1 ? "" : "s"} added`);
    if (agg.updates) parts.push(`${agg.updates} change${agg.updates === 1 ? "" : "s"} applied`);
    return { datasetId, actor, summary: `Accepted ${actor}'s update — ${parts.join(", ")}` };
  });
}

/** Reject (discard) an arbitrary set of proposals. */
export async function rejectProposals(db: SupabaseClient, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db.from("dataset_rows").delete().in("id", ids).eq("status", "proposed");
  if (error) throw error;
}

/**
 * Demo helper: fabricate an incoming agent update so the review/conflict flow
 * can be seen without a live extraction pipeline. Proposes one brand-new row
 * and one change to the first existing row.
 */
export async function simulateAgentUpdate(
  db: SupabaseClient,
  orgId: string,
  datasetId: string,
): Promise<void> {
  const { data: dsRow } = await db
    .from("datasets")
    .select("columns, agents ( name )")
    .eq("id", datasetId)
    .maybeSingle();
  const ds = dsRow as { columns: DatasetColumn[]; agents: { name: string } | null } | null;
  if (!ds) throw new Error("Table not found");
  const cols = Array.isArray(ds.columns) ? ds.columns : [];
  const agentName = ds.agents?.name ?? "An agent";

  const { data: rowsData } = await db
    .from("dataset_rows")
    .select("id, data")
    .eq("dataset_id", datasetId)
    .eq("status", "accepted")
    .order("created_at", { ascending: true })
    .limit(1);
  const first = (rowsData ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;

  // A brand-new row.
  const addData: Record<string, unknown> = {};
  for (const c of cols) {
    addData[c.key] = c.type === "number" ? 1000 : c.type === "date" ? new Date().toISOString().slice(0, 10) : `New from ${agentName}`;
  }

  // A change to the first row: bump a number, else append to the first text field.
  const updates: { targetRowId: string; data: Record<string, unknown> }[] = [];
  if (first) {
    const next = { ...first.data };
    const numCol = cols.find((c) => c.type === "number");
    const textCol = cols.find((c) => c.type !== "number" && c.type !== "date");
    if (numCol) {
      const cur = Number(next[numCol.key]) || 0;
      next[numCol.key] = Math.round(cur * 1.1);
    } else if (textCol) {
      next[textCol.key] = `${next[textCol.key] ?? ""} (updated by ${agentName})`.trim();
    }
    updates.push({ targetRowId: first.id, data: next });
  }

  await proposeAgentRows(db, orgId, datasetId, agentName, [addData], updates);
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

/** Manual row edit — marks the row human-edited so agents can't silently
 *  overwrite it (their differing values become a conflict to review). */
export async function updateRow(
  db: SupabaseClient,
  rowId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("dataset_rows").update({ data, human_edited: true }).eq("id", rowId);
  if (error) throw error;
}

export async function deleteRow(db: SupabaseClient, rowId: string): Promise<void> {
  const { error } = await db.from("dataset_rows").delete().eq("id", rowId);
  if (error) throw error;
}
