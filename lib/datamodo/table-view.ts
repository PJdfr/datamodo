// TABLE VIEW — the pure half of the Notion-grammar table surface (2026-07-20
// redesign: row = page, one table many views, typed grid, side peek). This
// module owns everything the grid can compute without a DOM or a database:
// the saved per-table view config (what the localStorage blob may contain),
// column ordering/visibility, the virtualization window math, typed cell
// coercion/formatting/comparison, the quick filter, row provenance, and the
// snapshot diff (moved here from the old TableDetailModal). Pure module
// (type imports only) — unit-tested under node:test; the view
// (app/dashboard/table-page.tsx) renders what this computes.

import type { DatasetColumn, DatasetRowRecord } from "./types";

/* ------------------------------------------------------------------ */
/* Saved per-table view config (localStorage — NO schema change)       */
/* ------------------------------------------------------------------ */

export type TableViewName = "grid" | "cards";

export interface TableViewConfig {
  /** Which rendering of the table is active. Grid is the default. */
  view: TableViewName;
  /** Persisted sort: one column + direction (Notion-style single sort). */
  sort: { key: string; dir: "asc" | "desc" } | null;
  /** Hidden column keys (columns stay in the schema; the view just skips them). */
  hidden: string[];
  /** Preferred column order (keys). Unknown keys keep their natural order
   *  appended after the ordered ones — a template edit never loses columns. */
  order: string[];
}

/** Bump the suffix if the shape ever changes incompatibly. */
export const TABLE_VIEW_STORE_PREFIX = "dm-table-view-v1:";
export const viewStorageKey = (tableId: string): string => `${TABLE_VIEW_STORE_PREFIX}${tableId}`;

export const defaultViewConfig = (): TableViewConfig => ({ view: "grid", sort: null, hidden: [], order: [] });

const isStr = (v: unknown): v is string => typeof v === "string";

/** Parse an untrusted localStorage blob into a valid config — anything off
 *  shape degrades to the default field-by-field, never a throw. */
export function sanitizeViewConfig(raw: unknown): TableViewConfig {
  const cfg = defaultViewConfig();
  if (!raw || typeof raw !== "object") return cfg;
  const r = raw as Record<string, unknown>;
  if (r.view === "cards" || r.view === "grid") cfg.view = r.view;
  if (r.sort && typeof r.sort === "object") {
    const s = r.sort as Record<string, unknown>;
    if (isStr(s.key) && s.key && (s.dir === "asc" || s.dir === "desc")) cfg.sort = { key: s.key, dir: s.dir };
  }
  if (Array.isArray(r.hidden)) cfg.hidden = r.hidden.filter(isStr);
  if (Array.isArray(r.order)) cfg.order = r.order.filter(isStr);
  return cfg;
}

/** The columns the view actually shows, in the view's order: ordered keys
 *  first (only those that still exist), then the rest in schema order, minus
 *  the hidden ones. Never hides the LAST visible column implicitly — an
 *  all-hidden config falls back to showing everything. */
export function orderColumns<T extends { key: string }>(columns: T[], cfg: TableViewConfig): T[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const ordered: T[] = [];
  for (const key of cfg.order) {
    const c = byKey.get(key);
    if (c) { ordered.push(c); byKey.delete(key); }
  }
  for (const c of columns) if (byKey.has(c.key)) ordered.push(c);
  const hidden = new Set(cfg.hidden);
  const visible = ordered.filter((c) => !hidden.has(c.key));
  return visible.length ? visible : ordered;
}

/* ------------------------------------------------------------------ */
/* Virtualization window math + progressive paged fetch                */
/* ------------------------------------------------------------------ */

/** How many rows one fetch asks for. The first page is the first paint. */
export const ROW_PAGE_SIZE = 200;

/** The slice of rows worth rendering for a scroll position — fixed row
 *  height, `overscan` extra rows on each side so scrolling never blanks. */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan = 8,
): { start: number; end: number } {
  if (total <= 0 || rowHeight <= 0 || viewportHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const count = Math.ceil(viewportHeight / rowHeight) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + count + overscan);
  return { start, end };
}

/** Progressive loader: given how many rows are already loaded and the honest
 *  server total, the next `{offset, limit}` to fetch — or null when done. */
export function nextPage(
  loaded: number,
  total: number,
  pageSize = ROW_PAGE_SIZE,
): { offset: number; limit: number } | null {
  if (loaded >= total) return null;
  return { offset: loaded, limit: Math.min(pageSize, total - loaded) };
}

/* ------------------------------------------------------------------ */
/* Typed cells: coerce on edit, format on display, compare on sort     */
/* ------------------------------------------------------------------ */

/** What a committed edit stores, by column type. Empty clears the cell; a
 *  number column keeps unparseable input as text rather than destroying it. */
export function coerceCell(type: string, raw: string): string | number | null {
  if (raw === "") return null;
  if (type === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

/** Display string for a cell value — em-dash for empty, numbers localized. */
export function formatCell(type: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "number" && typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Typed comparator for sorting: numbers numerically, dates chronologically
 *  (ISO strings compare lexically; loose values fall back to text), text
 *  case-insensitively. Empty cells always sort LAST in either direction —
 *  the caller applies that before flipping for `desc`. */
export function compareCells(type: string, a: unknown, b: unknown): number {
  if (type === "number") {
    const na = typeof a === "number" ? a : Number(a);
    const nb = typeof b === "number" ? b : Number(b);
    const aOk = Number.isFinite(na);
    const bOk = Number.isFinite(nb);
    if (aOk && bOk) return na - nb;
    if (aOk !== bOk) return aOk ? -1 : 1; // numeric values before stray text
  }
  return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: type === "date" });
}

/** Empty-cell test shared by sorting (empties sort last via the grid's
 *  sortUndefined) and the quick filter. */
export const isEmptyCell = (v: unknown): boolean => v === null || v === undefined || v === "";

/* ------------------------------------------------------------------ */
/* Quick filter + row provenance                                       */
/* ------------------------------------------------------------------ */

/** Case-insensitive substring match across the row's visible cells. */
export function rowMatchesFilter(
  data: Record<string, unknown>,
  columns: { key: string; type: string }[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return columns.some((c) => {
    const v = data?.[c.key];
    return !isEmptyCell(v) && formatCell(c.type, v).toLowerCase().includes(q);
  });
}

export type RowProvenance = "human" | "agent";

/** Row-level provenance (phase 1 honest scope): ink = a human made or touched
 *  it, coral = extraction/projection/derive wrote it and no human has since.
 *  The cell-level fact-source drill-down lives in the side peek, where facts
 *  carry their real sources. */
export function rowProvenance(row: Pick<DatasetRowRecord, "humanEdited" | "createdBy">): RowProvenance {
  return row.humanEdited || row.createdBy ? "human" : "agent";
}

/* ------------------------------------------------------------------ */
/* Snapshot diff (from the old TableDetailModal — unchanged semantics)  */
/* ------------------------------------------------------------------ */

/** A row's identity inside a snapshot: its first-column value, normalized. */
export function rowIdentity(data: Record<string, unknown>, keyCol: string | undefined): string | null {
  const v = keyCol ? data?.[keyCol] : undefined;
  return v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().toLowerCase();
}

export type SnapDiff = { added: Set<number>; changed: Set<number>; removed: number };

/** Compare two snapshots by first-column identity (JSON equality fallback for
 *  identity-less rows): which current rows are new/changed, how many gone. */
export function diffSnapshots(
  prev: { data: Record<string, unknown> }[],
  cur: { data: Record<string, unknown> }[],
  keyCol: string | undefined,
): SnapDiff {
  const prevByKey = new Map<string, string>();
  const prevJson = new Set<string>();
  for (const r of prev) {
    const j = JSON.stringify(r.data);
    prevJson.add(j);
    const k = rowIdentity(r.data, keyCol);
    if (k) prevByKey.set(k, j);
  }
  const curJson = new Set<string>();
  const curKeys = new Set<string>();
  const added = new Set<number>();
  const changed = new Set<number>();
  cur.forEach((r, idx) => {
    const j = JSON.stringify(r.data);
    curJson.add(j);
    const k = rowIdentity(r.data, keyCol);
    if (k) {
      curKeys.add(k);
      if (!prevByKey.has(k)) added.add(idx);
      else if (prevByKey.get(k) !== j) changed.add(idx);
    } else if (!prevJson.has(j)) {
      added.add(idx);
    }
  });
  let removed = 0;
  for (const r of prev) {
    const k = rowIdentity(r.data, keyCol);
    if (k) { if (!curKeys.has(k)) removed++; }
    else if (!curJson.has(JSON.stringify(r.data))) removed++;
  }
  return { added, changed, removed };
}

/* ------------------------------------------------------------------ */
/* Keyboard navigation (pure position math — the view owns the events)  */
/* ------------------------------------------------------------------ */

export interface CellPos { r: number; c: number }

/** Where a navigation key lands from `pos` in a rows×cols grid. Tab wraps to
 *  the next/previous row; arrows clamp at the edges. Returns the same
 *  position for keys that don't navigate. */
export function moveCell(
  pos: CellPos,
  key: "up" | "down" | "left" | "right" | "tab" | "shiftTab",
  rows: number,
  cols: number,
): CellPos {
  if (rows <= 0 || cols <= 0) return pos;
  let { r, c } = pos;
  switch (key) {
    case "up": r -= 1; break;
    case "down": r += 1; break;
    case "left": c -= 1; break;
    case "right": c += 1; break;
    case "tab":
      c += 1;
      if (c >= cols) { c = 0; r += 1; }
      break;
    case "shiftTab":
      c -= 1;
      if (c < 0) { c = cols - 1; r -= 1; }
      break;
  }
  return { r: Math.max(0, Math.min(rows - 1, r)), c: Math.max(0, Math.min(cols - 1, c)) };
}
