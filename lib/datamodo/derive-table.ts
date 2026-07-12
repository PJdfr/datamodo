// DERIVE A TABLE FROM THE GRAPH — the user describes the table they want in
// plain language ("companies with what they owe me and who I know there") and
// we build it OUT OF THE GRAPH: rows are entities of one kind, columns are
// attribute facts, relationship targets (either direction), or counts.
// The LLM only DESIGNS the spec (from a compact schema summary of the user's
// own graph — never the data itself); building the rows is deterministic and
// happens here, so every cell is traceable to facts. On-demand only (north
// star): one call when the user asks, preview before anything is written.
// Pure module (type imports only) — unit-tested under node:test; the route
// (app/api/knowledge/derive-table) is the LLM/DB shell.

import type { DatasetColumn, KnowledgeEntityView } from "./types";

export const slugKey = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/* --------------------------------------------------------------------------
 * Graph schema summary — what the LLM designs against.
 * ------------------------------------------------------------------------ */

export interface KindSummary {
  kind: string;
  count: number;
  /** Attribute predicates seen on this kind, with a sample value. */
  attrs: { predicate: string; count: number; sample: string }[];
  /** Outgoing relationship predicates (this kind → target kinds). */
  relsOut: { predicate: string; count: number; targetKinds: string[] }[];
  /** Incoming relationship predicates (source kinds → this kind). */
  relsIn: { predicate: string; count: number; sourceKinds: string[] }[];
}

const MAX_LISTED = 14;

export function summarizeGraph(entities: KnowledgeEntityView[]): KindSummary[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const kinds = new Map<string, KindSummary>();
  const get = (kind: string): KindSummary => {
    let s = kinds.get(kind);
    if (!s) { s = { kind, count: 0, attrs: [], relsOut: [], relsIn: [] }; kinds.set(kind, s); }
    return s;
  };
  type Acc = { count: number; sample: string; others: Set<string> };
  const attrAcc = new Map<string, Map<string, Acc>>();
  const outAcc = new Map<string, Map<string, Acc>>();
  const inAcc = new Map<string, Map<string, Acc>>();
  const bump = (m: Map<string, Map<string, Acc>>, kind: string, predicate: string, sample: string, other?: string) => {
    if (!m.has(kind)) m.set(kind, new Map());
    const inner = m.get(kind)!;
    const acc = inner.get(predicate) ?? { count: 0, sample, others: new Set<string>() };
    acc.count++;
    if (other) acc.others.add(other);
    inner.set(predicate, acc);
  };

  for (const e of entities) {
    get(e.kind).count++;
    for (const f of e.facts) {
      if (f.ref && f.refId) {
        const target = byId.get(f.refId);
        bump(outAcc, e.kind, f.predicate, f.value, target?.kind ?? "?");
        if (target) bump(inAcc, target.kind, f.predicate, e.label, e.kind);
      } else if (!f.ref) {
        bump(attrAcc, e.kind, f.predicate, f.value);
      }
    }
  }

  for (const [kind, s] of kinds) {
    const top = (m: Map<string, Map<string, Acc>>) =>
      [...(m.get(kind) ?? new Map<string, Acc>()).entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .slice(0, MAX_LISTED);
    s.attrs = top(attrAcc).map(([predicate, a]) => ({ predicate, count: a.count, sample: a.sample.slice(0, 60) }));
    s.relsOut = top(outAcc).map(([predicate, a]) => ({ predicate, count: a.count, targetKinds: [...a.others].sort() }));
    s.relsIn = top(inAcc).map(([predicate, a]) => ({ predicate, count: a.count, sourceKinds: [...a.others].sort() }));
  }
  return [...kinds.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

/** The compact text the LLM reads — schema only, never the user's data
 *  (samples are single values, needed so the model can pick types). */
export function renderGraphSummary(summary: KindSummary[]): string {
  const lines: string[] = [];
  for (const s of summary) {
    lines.push(`- kind "${s.kind}" (${s.count} entities)`);
    for (const a of s.attrs) lines.push(`    attr "${a.predicate}" ×${a.count} — e.g. "${a.sample}"`);
    for (const r of s.relsOut) lines.push(`    relation out "${r.predicate}" ×${r.count} → ${r.targetKinds.join("/") || "?"}`);
    for (const r of s.relsIn) lines.push(`    relation in "${r.predicate}" ×${r.count} ← ${r.sourceKinds.join("/") || "?"}`);
  }
  return lines.join("\n");
}

/* --------------------------------------------------------------------------
 * The table spec — what the LLM returns, validated hard before use.
 * ------------------------------------------------------------------------ */

export type DeriveSource =
  | { from: "label" }
  | { from: "kind" }
  | { from: "attr"; predicate: string }
  | { from: "relation"; predicate: string; direction: "out" | "in" | "any"; agg: "list" | "count" };

export interface DeriveColumnSpec {
  key: string;
  label: string;
  type: string; // text | number | date
  source: DeriveSource;
}

export interface DeriveTableSpec {
  name: string;
  description: string;
  /** Rows = entities of this kind. */
  kind: string;
  columns: DeriveColumnSpec[];
}

export function buildDeriveTablePrompt(request: string, summary: KindSummary[]): { system: string; user: string } {
  return {
    system: [
      "You design ONE table over the user's personal knowledge graph. You see the graph's SCHEMA (kinds, attribute predicates, relationship predicates) — not the data.",
      "Rows will be the entities of one kind; columns pull from that kind's facts. Pick the kind and columns that best answer the user's request.",
      "Column sources (the builder fills cells deterministically from the graph):",
      '- {"from":"label"} — the entity\'s own name',
      '- {"from":"kind"} — the entity\'s kind',
      '- {"from":"attr","predicate":"<attribute predicate>"} — the fact\'s value',
      '- {"from":"relation","predicate":"<relationship predicate>","direction":"out"|"in"|"any","agg":"list"|"count"} — linked entities\' names (or how many)',
      "Rules:",
      "- Use ONLY kinds and predicates that appear in the schema. Never invent.",
      '- 3–8 columns. The first column should usually be {"from":"label"}.',
      '- Column "type" is "text", "number" or "date" — use "number" for amounts/counts, "date" for dates.',
      '- Direction: "out" when the row\'s kind carries the relation, "in" when other kinds point at it, "any" when unsure.',
      '- If the request cannot be built from this schema, respond {"error":"<one short sentence why>"}.',
      'Respond with ONLY JSON: {"name":"<table name>","description":"<one sentence>","kind":"<kind>","columns":[{"label":"...","type":"...","source":{...}}]}',
    ].join("\n"),
    user: `Request: ${request}\n\nGraph schema:\n${renderGraphSummary(summary)}`,
  };
}

/** Validate/sanitize what the model returned into a usable spec (or say why
 *  not). Forgiving where safe (defaults, key slugs), strict on vocabulary —
 *  unknown kinds/predicates are the model inventing, and we refuse those. */
export function parseDeriveSpec(
  raw: unknown,
  summary: KindSummary[],
): { spec: DeriveTableSpec; error?: undefined } | { spec?: undefined; error: string } {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return { error: "the model returned nothing usable" };
  if (typeof o.error === "string" && o.error) return { error: o.error };

  const byKind = new Map(summary.map((s) => [s.kind, s]));
  const kind = typeof o.kind === "string" ? o.kind.trim() : "";
  const kindSum = byKind.get(kind);
  if (!kindSum) return { error: `unknown kind "${kind}" — not in your graph` };

  const name = (typeof o.name === "string" ? o.name.trim() : "") || `${kind} table`;
  const description = typeof o.description === "string" ? o.description.trim() : "";

  const attrSet = new Set(kindSum.attrs.map((a) => slugKey(a.predicate)));
  const relSet = new Set([...kindSum.relsOut, ...kindSum.relsIn].map((r) => slugKey(r.predicate)));

  const rawCols = Array.isArray(o.columns) ? o.columns : [];
  const columns: DeriveColumnSpec[] = [];
  const seen = new Set<string>();
  for (const rc of rawCols as Record<string, unknown>[]) {
    if (!rc || typeof rc !== "object") continue;
    const label = typeof rc.label === "string" ? rc.label.trim() : "";
    const src = rc.source as Record<string, unknown> | null;
    if (!label || !src || typeof src !== "object") continue;
    const from = src.from;
    let source: DeriveSource | null = null;
    if (from === "label" || from === "kind") source = { from };
    else if (from === "attr" && typeof src.predicate === "string" && attrSet.has(slugKey(src.predicate))) {
      source = { from: "attr", predicate: src.predicate };
    } else if (from === "relation" && typeof src.predicate === "string" && relSet.has(slugKey(src.predicate))) {
      const direction = src.direction === "out" || src.direction === "in" ? src.direction : "any";
      const agg = src.agg === "count" ? "count" : "list";
      source = { from: "relation", predicate: src.predicate, direction, agg };
    }
    if (!source) continue; // invented predicate / malformed — drop the column
    const type =
      source.from === "relation" && source.agg === "count"
        ? "number"
        : ["text", "number", "date"].includes(rc.type as string) ? (rc.type as string) : "text";
    const base = slugKey(label) || "col";
    let key = base;
    let n = 2;
    while (seen.has(key)) key = `${base}_${n++}`;
    seen.add(key);
    columns.push({ key, label, type, source });
  }

  // Always give the row its name — prepend a label column if the model forgot.
  if (!columns.some((c) => c.source.from === "label")) {
    let key = "name";
    let n = 2;
    while (seen.has(key)) key = `name_${n++}`;
    columns.unshift({ key, label: "Name", type: "text", source: { from: "label" } });
  }
  if (columns.length < 2) return { error: "the model designed no usable columns for that request" };
  return { spec: { name, description, kind, columns } };
}

/* --------------------------------------------------------------------------
 * Deterministic row building — the spec runs against the graph, no LLM.
 * ------------------------------------------------------------------------ */

const num = (v: string): number | null => {
  const m = v.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

function cellValue(values: string[], type: string): unknown {
  if (values.length === 0) return null;
  if (type === "number") {
    const n = num(values[0]);
    return n ?? values.join("; ");
  }
  return values.join("; ");
}

export interface DerivedTable {
  columns: DatasetColumn[];
  /** One row per entity — the entityId keeps the row tied to its node
   *  (dataset_rows.subject_entity_id), so derived tables walk in the graph. */
  rows: { entityId: string; data: Record<string, unknown> }[];
}

/** Build the table: one row per entity of spec.kind (label-ordered), each
 *  cell filled from the graph. Deterministic — same graph, same table. */
export function buildDerivedTable(entities: KnowledgeEntityView[], spec: DeriveTableSpec): DerivedTable {
  const subjects = entities
    .filter((e) => e.kind === spec.kind)
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  // Incoming relations: who points at each subject, by slugged predicate.
  const incoming = new Map<string, Map<string, string[]>>();
  for (const e of entities) {
    for (const f of e.facts) {
      if (!f.ref || !f.refId) continue;
      const p = slugKey(f.predicate);
      if (!incoming.has(f.refId)) incoming.set(f.refId, new Map());
      const m = incoming.get(f.refId)!;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(e.label);
    }
  }

  const rows = subjects.map((e) => {
    const row: Record<string, unknown> = {};
    for (const c of spec.columns) {
      const s = c.source;
      if (s.from === "label") { row[c.key] = e.label; continue; }
      if (s.from === "kind") { row[c.key] = e.kind; continue; }
      const want = slugKey(s.predicate);
      if (s.from === "attr") {
        const values = e.facts.filter((f) => !f.ref && slugKey(f.predicate) === want).map((f) => f.value);
        row[c.key] = cellValue(values, c.type);
        continue;
      }
      const out = s.direction !== "in"
        ? e.facts.filter((f) => f.ref && slugKey(f.predicate) === want).map((f) => f.value)
        : [];
      const inn = s.direction !== "out" ? (incoming.get(e.id)?.get(want) ?? []) : [];
      const values = [...out, ...inn.sort((a, b) => a.localeCompare(b))];
      row[c.key] = s.agg === "count" ? values.length : cellValue(values, c.type);
    }
    return { entityId: e.id, data: row };
  });

  return { columns: spec.columns.map(({ key, label, type }) => ({ key, label, type })), rows };
}
