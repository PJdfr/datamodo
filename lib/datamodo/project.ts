import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DatasetColumn } from "./types";

// FACTS → TABLES projection (pipeline step ⑦). A user table is a projection of
// the canonical facts: each entity of a chosen kind becomes one row, each column
// filled from a fact whose predicate matches the column key. Review happens at the
// FACT level, so this materializes rows DIRECTLY (accepted), not as a second
// table-level review. Idempotent: rows are linked to their entity
// (dataset_rows.subject_entity_id), so re-projecting updates rows instead of
// duplicating them, and human-edited rows are left untouched.

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
  orgId: string,
  opts: { kind: string; datasetId: string; agentName?: string; labelColumn?: string },
): Promise<ProjectResult> {
  const ds = await prisma.datasets.findFirst({
    where: { id: opts.datasetId, org_id: orgId },
    select: { columns: true },
  });
  if (!ds) throw new Error("dataset not found");
  const columns = ((ds as unknown as { columns: DatasetColumn[] }).columns ?? []);
  const colType = new Map(columns.map((c) => [c.key, c.type]));
  const colKeys = new Set(columns.map((c) => c.key));
  // Which column holds the entity's own name.
  const labelKey =
    opts.labelColumn ??
    columns.find((c) => ["name", "label", opts.kind].includes(c.key))?.key ??
    columns[0]?.key;

  const ents = await prisma.entities.findMany({
    where: { org_id: orgId, kind: opts.kind, merged_into: null },
    select: { id: true, canonical_label: true },
  });
  const entities = ents ?? [];
  if (entities.length === 0) return { entities: 0, added: 0, updated: 0, unchanged: 0, batchId: null };
  const entIds = entities.map((e) => e.id);

  const facts = await prisma.facts.findMany({
    where: { org_id: orgId, subject_entity_id: { in: entIds }, valid_to: null },
    select: {
      subject_entity_id: true,
      object_entity_id: true,
      predicate: true,
      value_text: true,
      value_num: true,
      value_date: true,
      unit: true,
    },
  });
  const factList: FactLite[] = (facts ?? []).map((f) => ({
    subject_entity_id: f.subject_entity_id,
    object_entity_id: f.object_entity_id,
    predicate: f.predicate,
    value_text: f.value_text,
    value_num: f.value_num != null ? Number(f.value_num) : null,
    value_date: f.value_date ? f.value_date.toISOString().slice(0, 10) : null,
    unit: f.unit,
  }));

  // Labels for entity-valued cells (object entities may be other kinds).
  const label = new Map(entities.map((e) => [e.id, e.canonical_label]));
  const objIds = [...new Set(factList.map((f) => f.object_entity_id).filter(Boolean) as string[])].filter((id) => !label.has(id));
  if (objIds.length) {
    const objs = await prisma.entities.findMany({
      where: { id: { in: objIds } },
      select: { id: true, canonical_label: true },
    });
    for (const o of objs ?? []) label.set(o.id, o.canonical_label);
  }
  const labelOf = (id: string) => label.get(id) ?? "?";

  const bySubject = new Map<string, FactLite[]>();
  for (const f of factList) {
    if (!bySubject.has(f.subject_entity_id)) bySubject.set(f.subject_entity_id, []);
    bySubject.get(f.subject_entity_id)!.push(f);
  }

  const existing = await prisma.dataset_rows.findMany({
    where: { dataset_id: opts.datasetId, subject_entity_id: { in: entIds } },
    select: { id: true, subject_entity_id: true, data: true, human_edited: true, status: true },
  });
  const existingRows = (existing as { id: string; subject_entity_id: string | null; data: Record<string, unknown>; human_edited: boolean; status: string }[] | null) ?? [];
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
    if (pendingEntities.has(e.id)) { unchanged++; continue; } // leave any legacy pending row alone
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

  // Tables are a PROJECTION of accepted facts — the user reviews at the fact
  // level, so we materialize rows directly (no separate table-level review).
  if (adds.length) {
    await prisma.dataset_rows.createMany({
      data: adds.map((a) => ({
        org_id: orgId,
        dataset_id: opts.datasetId,
        status: "accepted",
        origin: "agent",
        subject_entity_id: a.entityId,
        data: a.data as Prisma.InputJsonValue,
      })),
    });
  }
  for (const u of updates) {
    await prisma.dataset_rows.update({ where: { id: u.rowId }, data: { data: u.data as Prisma.InputJsonValue, origin: "agent" } });
  }
  return { entities: entities.length, added: adds.length, updated: updates.length, unchanged, batchId: null };
}
