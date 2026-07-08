import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatasetColumn } from "./types";

// FACTS → TABLES projection (pipeline step ⑦). A user table is a projection of
// the canonical facts: each entity of a chosen kind becomes one row, each column
// filled from a fact whose predicate matches the column key. Output is emitted as
// PROPOSALS (via dataset_rows), so it flows through the existing Versioning review
// UI. Idempotent: rows are linked to their entity (dataset_rows.subject_entity_id),
// so re-projecting updates rows instead of duplicating them, and human-edited rows
// are left untouched.

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

interface FactLite {
  subject_entity_id: string;
  object_entity_id: string | null;
  predicate: string;
  value_text: string | null;
  value_num: number | null;
  value_date: string | null;
  unit: string | null;
}

/** Typed cell value for a projected column (numbers stay numbers; refs → label). */
function cellValue(f: FactLite, type: string, label: (id: string) => string): unknown {
  if (f.object_entity_id) return label(f.object_entity_id);
  if (type === "number" && f.value_num != null) return f.value_num;
  if (f.value_num != null) return f.unit ? `${f.value_num} ${f.unit}` : f.value_num;
  if (f.value_date) return f.value_date;
  return f.value_text ?? null;
}

export interface ProjectResult {
  entities: number;
  added: number;
  updated: number;
  unchanged: number;
  batchId: string | null;
}

/**
 * Project every entity of `kind` into rows of `datasetId`, matching each column
 * (by key, against the slug of a fact predicate) and putting the entity's own
 * name in the label column. Emits proposals for new/changed rows.
 */
export async function projectEntitiesToDataset(
  admin: SupabaseClient,
  orgId: string,
  opts: { kind: string; datasetId: string; agentName?: string; labelColumn?: string },
): Promise<ProjectResult> {
  const { data: ds, error: dsErr } = await admin
    .from("datasets").select("columns").eq("id", opts.datasetId).eq("org_id", orgId).single();
  if (dsErr) throw dsErr;
  const columns = ((ds as { columns: DatasetColumn[] }).columns ?? []);
  const colType = new Map(columns.map((c) => [c.key, c.type]));
  const colKeys = new Set(columns.map((c) => c.key));
  // Which column holds the entity's own name.
  const labelKey =
    opts.labelColumn ??
    columns.find((c) => ["name", "label", opts.kind].includes(c.key))?.key ??
    columns[0]?.key;

  const { data: ents, error: eErr } = await admin
    .from("entities").select("id, canonical_label").eq("org_id", orgId).eq("kind", opts.kind).is("merged_into", null);
  if (eErr) throw eErr;
  const entities = (ents as { id: string; canonical_label: string }[] | null) ?? [];
  if (entities.length === 0) return { entities: 0, added: 0, updated: 0, unchanged: 0, batchId: null };
  const entIds = entities.map((e) => e.id);

  const { data: facts, error: fErr } = await admin
    .from("facts")
    .select("subject_entity_id, object_entity_id, predicate, value_text, value_num, value_date, unit")
    .eq("org_id", orgId).in("subject_entity_id", entIds).is("valid_to", null);
  if (fErr) throw fErr;
  const factList = (facts as FactLite[] | null) ?? [];

  // Labels for entity-valued cells (object entities may be other kinds).
  const label = new Map(entities.map((e) => [e.id, e.canonical_label]));
  const objIds = [...new Set(factList.map((f) => f.object_entity_id).filter(Boolean) as string[])].filter((id) => !label.has(id));
  if (objIds.length) {
    const { data: objs } = await admin.from("entities").select("id, canonical_label").in("id", objIds);
    for (const o of (objs as { id: string; canonical_label: string }[] | null) ?? []) label.set(o.id, o.canonical_label);
  }
  const labelOf = (id: string) => label.get(id) ?? "?";

  const bySubject = new Map<string, FactLite[]>();
  for (const f of factList) {
    if (!bySubject.has(f.subject_entity_id)) bySubject.set(f.subject_entity_id, []);
    bySubject.get(f.subject_entity_id)!.push(f);
  }

  const { data: existing } = await admin
    .from("dataset_rows").select("id, subject_entity_id, data, human_edited, status").eq("dataset_id", opts.datasetId).in("subject_entity_id", entIds);
  const existingRows = (existing as { id: string; subject_entity_id: string; data: Record<string, unknown>; human_edited: boolean; status: string }[] | null) ?? [];
  // Skip entities that already have a proposal queued (don't stack duplicates);
  // decide add-vs-update against the ACCEPTED row (the real table state).
  const pendingEntities = new Set(existingRows.filter((r) => r.status === "proposed").map((r) => r.subject_entity_id));
  const acceptedByEntity = new Map(existingRows.filter((r) => r.status === "accepted").map((r) => [r.subject_entity_id, r]));
  // Order-independent structural compare (jsonb normalizes key order).
  const canon = (o: Record<string, unknown>) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

  const adds: { data: Record<string, unknown>; entityId: string }[] = [];
  const updates: { rowId: string; data: Record<string, unknown>; entityId: string }[] = [];
  let unchanged = 0;

  for (const e of entities) {
    if (pendingEntities.has(e.id)) { unchanged++; continue; } // already queued for review
    const data: Record<string, unknown> = {};
    if (labelKey) data[labelKey] = e.canonical_label;
    for (const f of bySubject.get(e.id) ?? []) {
      const key = slug(f.predicate);
      if (colKeys.has(key) && key !== labelKey) data[key] = cellValue(f, colType.get(key) ?? "text", labelOf);
    }
    const ex = acceptedByEntity.get(e.id);
    if (!ex) adds.push({ data, entityId: e.id });
    else if (ex.human_edited) unchanged++; // never clobber a hand-edited row
    else if (canon(ex.data) === canon(data)) unchanged++;
    else updates.push({ rowId: ex.id, data, entityId: e.id });
  }

  const batchId = crypto.randomUUID();
  const base = {
    org_id: orgId,
    dataset_id: opts.datasetId,
    status: "proposed" as const,
    origin: "agent",
    proposed_by: opts.agentName ?? "Knowledge",
    batch_id: batchId,
  };
  const rows = [
    ...adds.map((a) => ({ ...base, data: a.data, proposed_kind: "add", subject_entity_id: a.entityId })),
    ...updates.map((u) => ({ ...base, data: u.data, proposed_kind: "update", target_row_id: u.rowId, subject_entity_id: u.entityId })),
  ];
  if (rows.length) {
    const { error } = await admin.from("dataset_rows").insert(rows);
    if (error) throw error;
  }
  return { entities: entities.length, added: adds.length, updated: updates.length, unchanged, batchId: rows.length ? batchId : null };
}
