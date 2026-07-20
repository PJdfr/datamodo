import { prisma } from "@/lib/prisma";
import type { KindField, KindRelation } from "./ontology";
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
  created_at: Date;
  source_item_id: string | null;
};

/** List datasets in an org, enriched with rows, version history, + proposals. */
export async function listDatasets(orgId: string): Promise<DatasetView[]> {
  const datasets = await prisma.datasets.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "asc" },
    include: { agents: { select: { name: true } } },
  });
  if (datasets.length === 0) return [];

  // Load ONLY pending proposals here (usually a small set) — never every
  // accepted row. The dashboard cards need counts, not the rows themselves;
  // full rows load lazily when a table is opened (see listDatasetRows).
  const propData = await prisma.dataset_rows.findMany({
    where: { org_id: orgId, status: "proposed" },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      dataset_id: true,
      data: true,
      human_edited: true,
      status: true,
      proposed_kind: true,
      target_row_id: true,
      proposed_by: true,
      batch_id: true,
      created_at: true,
      source_item_id: true,
    },
  });
  const proposed = propData as unknown as RawRow[];

  const proposedByDataset = new Map<string, RawRow[]>();
  for (const r of proposed) {
    const arr = proposedByDataset.get(r.dataset_id) ?? [];
    arr.push(r);
    proposedByDataset.set(r.dataset_id, arr);
  }

  // Fetch just the accepted rows those proposals target (for the yours-vs-theirs
  // conflict diff) — a targeted `in (...)`, not a full-table load.
  const targetIds = [...new Set(proposed.map((r) => r.target_row_id).filter(Boolean) as string[])];
  const targetById = new Map<string, { data: Record<string, unknown>; human_edited: boolean }>();
  if (targetIds.length) {
    const targets = await prisma.dataset_rows.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, data: true, human_edited: true },
    });
    for (const t of targets as { id: string; data: Record<string, unknown>; human_edited: boolean }[]) {
      targetById.set(t.id, { data: t.data ?? {}, human_edited: t.human_edited });
    }
  }

  // Label proposals with the message/email they were parsed from, when known.
  const sourceIds = [...new Set(proposed.filter((r) => r.source_item_id).map((r) => r.source_item_id as string))];
  const sourceLabels = new Map<string, string>();
  if (sourceIds.length) {
    const items = await prisma.items.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, subject: true, sender: true },
    });
    for (const it of items as { id: string; subject: string | null; sender: string | null }[]) {
      sourceLabels.set(it.id, it.subject?.trim() || it.sender?.trim() || "a message");
    }
  }

  // Accepted-row counts, grouped in one query (no row payloads).
  const countByDataset = new Map<string, number>();
  const counts = await prisma.$queryRaw<{ dataset_id: string; n: bigint | number }[]>`
    SELECT * FROM dataset_accepted_counts(${orgId}::uuid)
  `;
  for (const c of counts ?? []) {
    countByDataset.set(c.dataset_id, Number(c.n));
  }

  // Version-history metadata (no heavy payloads).
  const snapData = await prisma.dataset_snapshots.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "desc" },
    select: { id: true, dataset_id: true, actor: true, summary: true, created_at: true },
  });
  const historyByDataset = new Map<string, SnapshotMeta[]>();
  for (const s of snapData as { id: string; dataset_id: string; actor: string; summary: string; created_at: Date }[]) {
    const arr = historyByDataset.get(s.dataset_id) ?? [];
    arr.push({ id: s.id, actor: s.actor, summary: s.summary, createdAt: s.created_at.toISOString() });
    historyByDataset.set(s.dataset_id, arr);
  }

  return datasets.map((d) => {
    const proposals: Proposal[] = (proposedByDataset.get(d.id) ?? []).map((p) => {
      const target = p.target_row_id ? targetById.get(p.target_row_id) : null;
      return {
        id: p.id,
        kind: p.proposed_kind === "update" ? "update" : "add",
        proposedBy: p.proposed_by ?? "An agent",
        data: p.data ?? {},
        targetRowId: p.target_row_id,
        currentData: target?.data ?? null,
        conflict: !!target && target.human_edited,
        batchId: p.batch_id,
        createdAt: p.created_at.toISOString(),
        sourceLabel: p.source_item_id ? sourceLabels.get(p.source_item_id) ?? null : null,
      };
    });
    return {
      id: d.id,
      org_id: d.org_id,
      agent_id: d.agent_id,
      kind_id: d.kind_id,
      name: d.name,
      description: d.description,
      columns: Array.isArray(d.columns) ? (d.columns as unknown as DatasetColumn[]) : [],
      created_by: d.created_by,
      created_at: d.created_at.toISOString(),
      updated_at: d.updated_at.toISOString(),
      agentName: d.agents?.name ?? null,
      rowCount: countByDataset.get(d.id) ?? 0,
      // Rows load lazily when a table is opened — the cards only need the count.
      rows: [],
      history: historyByDataset.get(d.id) ?? [],
      proposals,
    };
  });
}

/** Load a page of a table's accepted (live) rows, newest access shape for the
 *  table editor. Returns the rows plus the exact total so the UI can paginate. */
export async function listDatasetRows(
  datasetId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: DatasetRowRecord[]; total: number }> {
  const limit = opts.limit ?? 500;
  const offset = opts.offset ?? 0;
  const where = { dataset_id: datasetId, status: "accepted" as const };
  const [data, count] = await Promise.all([
    prisma.dataset_rows.findMany({
      where,
      select: { id: true, data: true, human_edited: true },
      orderBy: { created_at: "asc" },
      skip: offset,
      take: limit,
    }),
    prisma.dataset_rows.count({ where }),
  ]);
  const rows = (data as { id: string; data: Record<string, unknown>; human_edited: boolean }[]).map(
    (r) => ({ id: r.id, data: r.data ?? {}, humanEdited: r.human_edited }),
  );
  return { rows, total: count ?? rows.length };
}

// ---------------------------------------------------------------------------
// Version history: snapshots + restore
// ---------------------------------------------------------------------------

/** Save a full point-in-time copy of a table with a plain-language summary. */
export async function snapshotDataset(datasetId: string, actor: string, summary: string): Promise<void> {
  const ds = await getDataset(datasetId);
  if (!ds) return;
  const rows = await listAcceptedRows(datasetId);
  await prisma.dataset_snapshots.create({
    data: {
      dataset_id: datasetId,
      org_id: ds.org_id,
      actor,
      summary,
      columns: ds.columns as object,
      rows: rows as object,
    },
  });
}

/** Create an "Original version" checkpoint the first time a table is changed. */
export async function ensureBaseline(datasetId: string): Promise<void> {
  const count = await prisma.dataset_snapshots.count({ where: { dataset_id: datasetId } });
  if ((count ?? 0) === 0) await snapshotDataset(datasetId, "You", "Original version");
}

/** Run a mutation between a baseline check and a post-change checkpoint. */
export async function checkpoint(
  datasetId: string,
  summary: string,
  apply: () => Promise<void>,
  actor = "You",
): Promise<void> {
  await ensureBaseline(datasetId);
  await apply();
  await snapshotDataset(datasetId, actor, summary);
}

/** Full version history for a table (newest first) with each version's rows +
 *  columns, so the UI can preview a version and diff it against another. */
export async function listSnapshotsFull(datasetId: string): Promise<SnapshotFull[]> {
  const data = await prisma.dataset_snapshots.findMany({
    where: { dataset_id: datasetId },
    orderBy: { created_at: "desc" },
    select: { id: true, actor: true, summary: true, created_at: true, columns: true, rows: true },
  });
  return (data as unknown as {
    id: string;
    actor: string;
    summary: string;
    created_at: Date;
    columns: DatasetColumn[];
    rows: { data: Record<string, unknown> }[];
  }[]).map((s) => ({
    id: s.id,
    actor: s.actor,
    summary: s.summary,
    createdAt: s.created_at.toISOString(),
    columns: Array.isArray(s.columns) ? s.columns : [],
    rows: Array.isArray(s.rows) ? s.rows : [],
  }));
}

/** Rewind a table to a saved version (its rows + columns), keeping proposals. */
export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const data = await prisma.dataset_snapshots.findUnique({
    where: { id: snapshotId },
    select: { dataset_id: true, org_id: true, columns: true, rows: true, created_at: true },
  });
  if (!data) throw new Error("Version not found");
  const snap = data as unknown as { dataset_id: string; org_id: string; columns: DatasetColumn[]; rows: { data: Record<string, unknown> }[]; created_at: Date };

  await prisma.datasets.update({ where: { id: snap.dataset_id }, data: { columns: snap.columns as object } });
  await prisma.dataset_rows.deleteMany({ where: { dataset_id: snap.dataset_id, status: "accepted" } });
  if (snap.rows.length) {
    const insert = snap.rows.map((r) => ({
      dataset_id: snap.dataset_id,
      org_id: snap.org_id,
      data: (r.data ?? {}) as object,
      status: "accepted" as const,
      origin: "manual",
    }));
    await prisma.dataset_rows.createMany({ data: insert });
  }
  const when = snap.created_at.toLocaleString();
  await snapshotDataset(snap.dataset_id, "You", `Restored to the version from ${when}`);
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
    ...adds.map((data) => ({ ...base, data: data as object, proposed_kind: "add" })),
    ...updates.map((u) => ({ ...base, data: u.data as object, proposed_kind: "update", target_row_id: u.targetRowId })),
  ];
  await prisma.dataset_rows.createMany({ data: rows });
  return batchId;
}

/** Apply one proposal row: add the new row, or write the update onto its target. */
async function applyProposalRow(p: ProposalRow): Promise<"add" | "update"> {
  if (p.proposed_kind === "update" && p.target_row_id) {
    await prisma.dataset_rows.update({
      where: { id: p.target_row_id },
      data: { data: p.data as object, origin: "agent", human_edited: false },
    });
    await prisma.dataset_rows.delete({ where: { id: p.id } });
    return "update";
  }
  await prisma.dataset_rows.update({
    where: { id: p.id },
    data: { status: "accepted", proposed_kind: null, target_row_id: null },
  });
  return "add";
}

const PROPOSAL_SELECT = {
  id: true,
  dataset_id: true,
  data: true,
  proposed_kind: true,
  target_row_id: true,
  proposed_by: true,
} as const;

/** Apply a single proposal. */
export async function acceptProposal(proposalId: string): Promise<{ datasetId: string; summary: string; actor: string } | null> {
  const data = await prisma.dataset_rows.findUnique({ where: { id: proposalId }, select: PROPOSAL_SELECT });
  if (!data) return null;
  const p = data as ProposalRow;
  const actor = p.proposed_by ?? "An agent";
  const kind = await applyProposalRow(p);
  return { datasetId: p.dataset_id, summary: kind === "update" ? `Applied ${actor}'s change` : `Added ${actor}'s row`, actor };
}

export async function rejectProposal(proposalId: string): Promise<void> {
  await prisma.dataset_rows.delete({ where: { id: proposalId } });
}

/** Accept a whole chunk — every proposal in a batch — in one go. */
export async function acceptBatch(batchId: string): Promise<{ datasetId: string; summary: string; actor: string } | null> {
  const data = await prisma.dataset_rows.findMany({
    where: { batch_id: batchId, status: "proposed" },
    select: PROPOSAL_SELECT,
  });
  const props = data as ProposalRow[];
  if (!props.length) return null;

  const actor = props[0].proposed_by ?? "An agent";
  let adds = 0;
  let updates = 0;
  for (const p of props) {
    const kind = await applyProposalRow(p);
    if (kind === "update") updates++; else adds++;
  }
  const parts: string[] = [];
  if (adds) parts.push(`${adds} row${adds === 1 ? "" : "s"} added`);
  if (updates) parts.push(`${updates} change${updates === 1 ? "" : "s"} applied`);
  return { datasetId: props[0].dataset_id, summary: `Accepted ${actor}'s update — ${parts.join(", ")}`, actor };
}

/** Reject (discard) a whole chunk. */
export async function rejectBatch(batchId: string): Promise<void> {
  await prisma.dataset_rows.deleteMany({ where: { batch_id: batchId, status: "proposed" } });
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
export async function acceptProposals(ids: string[]): Promise<BulkAcceptResult[]> {
  if (!ids.length) return [];
  const data = await prisma.dataset_rows.findMany({
    where: { id: { in: ids }, status: "proposed" },
    select: PROPOSAL_SELECT,
  });
  const props = data as ProposalRow[];
  if (!props.length) return [];

  const perDataset = new Map<string, { adds: number; updates: number; actors: Set<string> }>();
  for (const p of props) {
    const kind = await applyProposalRow(p);
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
export async function rejectProposals(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await prisma.dataset_rows.deleteMany({ where: { id: { in: ids }, status: "proposed" } });
}

/** Fetch a single dataset by id (RLS returns null when not visible). */
export async function getDataset(datasetId: string): Promise<DatasetRecord | null> {
  const d = await prisma.datasets.findUnique({ where: { id: datasetId } });
  if (!d) return null;
  return {
    ...(d as unknown as DatasetRecord),
    columns: Array.isArray(d.columns) ? (d.columns as unknown as DatasetColumn[]) : [],
    created_at: d.created_at.toISOString(),
    updated_at: d.updated_at.toISOString(),
  };
}

/** Accepted rows for a dataset, oldest first — the exportable/live rows. */
export async function listAcceptedRows(datasetId: string): Promise<{ data: Record<string, unknown> }[]> {
  const data = await prisma.dataset_rows.findMany({
    where: { dataset_id: datasetId, status: "accepted" },
    select: { data: true },
    orderBy: { created_at: "asc" },
  });
  return data as { data: Record<string, unknown> }[];
}

export async function createDataset(
  orgId: string,
  createdBy: string,
  input: {
    name: string;
    description?: string | null;
    columns?: DatasetColumn[];
    agentId?: string | null;
    /** Structural "category = table" binding (the kind this materializes). */
    kindId?: string | null;
  },
): Promise<DatasetRecord> {
  const name = input.name?.trim();
  if (!name) throw new Error("Dataset name is required");

  const data = await prisma.datasets.create({
    data: {
      org_id: orgId,
      created_by: createdBy,
      agent_id: input.agentId ?? null,
      kind_id: input.kindId ?? null,
      name,
      description: input.description?.trim() || null,
      columns: (input.columns ?? []) as object,
    },
  });
  return {
    ...(data as unknown as DatasetRecord),
    columns: Array.isArray(data.columns) ? (data.columns as unknown as DatasetColumn[]) : [],
    created_at: data.created_at.toISOString(),
    updated_at: data.updated_at.toISOString(),
  };
}

// Internal bookkeeping fields aren't worth a table column.
const NON_COLUMN_FIELDS = new Set(["file_type", "file_size", "indexed"]);

/**
 * "Category → table" — the one-object materialization: a category's template IS
 * the table schema. Builds columns from the kind's fields + relation verbs,
 * creates (or adopts + binds) the dataset, then projects every entity of that
 * kind into it. Idempotent: a dataset already bound to the kind is reused.
 *
 * Factored out of `POST /api/kinds/[id]/table` so the MCP `create_category`
 * tool materializes tables through the exact same path the dashboard uses —
 * and so Phase-2 model unification has one place that knows "columns come from
 * the template".
 */
export async function materializeKindTable(
  orgId: string,
  userId: string,
  kindId: string,
): Promise<{ datasetId: string; name: string; entities: number; added: number; updated: number; unchanged: number }> {
  const row = await prisma.kinds.findFirst({ where: { id: kindId, org_id: orgId } });
  if (!row) throw new Error("category not found");
  const fields = (Array.isArray(row.fields) ? row.fields : []) as unknown as KindField[];
  const relations = (Array.isArray(row.relations) ? row.relations : []) as unknown as KindRelation[];

  const columns: DatasetColumn[] = [
    { key: "name", label: row.label, type: "text" },
    ...fields
      .filter((f) => !NON_COLUMN_FIELDS.has(f.key))
      .map((f) => ({ key: f.key, label: f.label, type: f.type === "entity" ? "text" : f.type })),
    // Relationship targets project as their label (text).
    ...relations.map((r) => ({ key: r.predicate, label: r.label, type: "text" })),
  ];

  const baseName = row.plural?.trim() || `${row.label}s`;
  // Structural "category = table" binding wins over any name convention.
  const bound = await prisma.datasets.findFirst({
    where: { org_id: orgId, kind_id: row.id },
    select: { id: true },
  });
  let datasetId: string;
  if (bound) {
    datasetId = bound.id;
  } else {
    try {
      const ds = await createDataset(orgId, userId, {
        name: baseName,
        description: `Built from the “${row.label}” category — refreshed by projecting the knowledge graph.`,
        columns,
        kindId: row.id,
      });
      datasetId = ds.id;
    } catch {
      // Name taken → ADOPT the existing table of that name and bind it.
      const existing = await prisma.datasets.findFirst({
        where: { org_id: orgId, name: { equals: baseName, mode: "insensitive" } },
        select: { id: true, kind_id: true },
      });
      if (!existing) throw new Error("could not create the table");
      if (!existing.kind_id) {
        await prisma.datasets.update({ where: { id: existing.id }, data: { kind_id: row.id } });
      }
      datasetId = existing.id;
    }
  }

  const { projectEntitiesToDataset } = await import("./project");
  const result = await projectEntitiesToDataset(orgId, {
    kind: row.kind,
    datasetId,
    agentName: "Categories",
    labelColumn: "name",
  });
  return { datasetId, name: baseName, ...result };
}

export async function renameDataset(datasetId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Dataset name is required");
  await prisma.datasets.update({ where: { id: datasetId }, data: { name: trimmed } });
}

export async function deleteDataset(datasetId: string): Promise<void> {
  await prisma.datasets.delete({ where: { id: datasetId } });
}

/** Replace a dataset's whole column set (used for retype/relabel/reorder). */
export async function setColumns(datasetId: string, columns: DatasetColumn[]): Promise<void> {
  await prisma.datasets.update({ where: { id: datasetId }, data: { columns: columns as object } });
}

/**
 * Add a column and backfill every existing row with `defaultValue` (in one
 * jsonb update). Keys are derived from the label and de-duplicated.
 */
export async function addColumn(
  datasetId: string,
  column: { label: string; type: string; defaultValue?: unknown },
): Promise<void> {
  const dataset = await getDataset(datasetId);
  if (!dataset) throw new Error("Table not found");

  const label = column.label.trim();
  if (!label) throw new Error("Column name is required");

  const existingKeys = new Set(dataset.columns.map((c) => c.key));
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "col";
  let key = base;
  let n = 2;
  while (existingKeys.has(key)) key = `${base}_${n++}`;

  const columns = [...dataset.columns, { key, label, type: column.type || "text" }];
  await setColumns(datasetId, columns);

  // Backfill every row in a single set-based update (Postgres jsonb_set) instead
  // of fetching + updating each row one at a time.
  const def = column.defaultValue ?? null;
  await prisma.$executeRaw`SELECT add_dataset_column(${datasetId}::uuid, ${key}, ${JSON.stringify(def)}::jsonb)`;
}

/** Remove a column definition and strip its key from every row. */
export async function removeColumn(datasetId: string, key: string): Promise<void> {
  const dataset = await getDataset(datasetId);
  if (!dataset) throw new Error("Table not found");
  await setColumns(datasetId, dataset.columns.filter((c) => c.key !== key));

  // Strip the key from every row in one set-based update.
  await prisma.$executeRaw`SELECT remove_dataset_column(${datasetId}::uuid, ${key})`;
}

/** Insert one structured row into a dataset. */
export async function insertRow(
  orgId: string,
  datasetId: string,
  data: Record<string, unknown>,
  opts: { createdBy?: string; sourceItemId?: string | null; status?: "accepted" | "proposed" } = {},
): Promise<void> {
  await prisma.dataset_rows.create({
    data: {
      org_id: orgId,
      dataset_id: datasetId,
      data: data as object,
      status: opts.status ?? "accepted",
      source_item_id: opts.sourceItemId ?? null,
      created_by: opts.createdBy ?? null,
    },
  });
}

/** Manual row edit — marks the row human-edited so agents can't silently
 *  overwrite it (their differing values become a conflict to review). */
export async function updateRow(rowId: string, data: Record<string, unknown>): Promise<void> {
  await prisma.dataset_rows.update({ where: { id: rowId }, data: { data: data as object, human_edited: true } });
}

export async function deleteRow(rowId: string): Promise<void> {
  await prisma.dataset_rows.delete({ where: { id: rowId } });
}
