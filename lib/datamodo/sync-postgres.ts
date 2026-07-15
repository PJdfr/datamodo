// OUTBOUND SYNC — Postgres writer (ROADMAP "Outbound sync — push datamodo's
// projections into the USER'S infra"). Philosophy fit: the vault is the
// product and every view is a projection — an external database is just
// another projection target. Phase 1 is ONE-WAY push, idempotent by the
// row's stable datamodo id (upsert, never duplicate on re-sync).
//
// This module is PURE (types + string building) so the DDL/DML generation
// unit-tests without a database; the shell (sync-outbound.ts) opens the
// connection and runs what this produces. Every identifier is quoted and
// validated — the target table/columns are datamodo-controlled (derived from
// our own column keys), never raw user free-text, and values always travel as
// bound parameters, never interpolated.

import type { DatasetColumn } from "./types";

/** A row to push: its stable datamodo id + the cell values by column key. */
export interface SyncRow {
  id: string;
  data: Record<string, unknown>;
}

/** Map a datamodo column type to a Postgres column type. Conservative — text
 *  is always safe; numbers/dates get real types so the target is queryable. */
export function pgType(dmType: string): string {
  switch (dmType) {
    case "number":
      return "double precision";
    case "date":
      return "date";
    case "status":
    case "text":
    default:
      return "text";
  }
}

/** Postgres identifier quoting: double-quote, escape embedded quotes. We also
 *  refuse anything with a NUL or over 63 bytes (PG truncates silently). */
export function quoteIdent(name: string): string {
  if (name.includes("\0")) throw new Error("invalid identifier");
  const trimmed = name.slice(0, 63);
  return `"${trimmed.replace(/"/g, '""')}"`;
}

/** Sanitize a proposed table name to a safe snake_case identifier. The UI
 *  suggests one from the dataset name; this guarantees it's a legal, quoted
 *  target regardless of what the user typed. */
export function safeTableName(proposed: string): string {
  const slug = proposed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "t$1"); // identifiers can't start with a digit
  return (slug || "datamodo_table").slice(0, 63);
}

export interface SyncPlan {
  /** CREATE TABLE IF NOT EXISTS … (id primary key + one column per DatasetColumn). */
  createTable: string;
  /** ALTER TABLE ADD COLUMN IF NOT EXISTS … — makes re-sync tolerant of a
   *  table that predates a new column (additive; we never drop). */
  addColumns: string[];
  /** The upsert statement with $1..$n placeholders; run once per row batch. */
  upsert: string;
  /** Ordered column keys the upsert's parameters follow (id first). */
  paramKeys: string[];
  /** The final, quoted+sanitized table name actually written. */
  table: string;
}

/**
 * Build the DDL + parameterized upsert for pushing a dataset to Postgres.
 * The table carries a `dm_id text primary key` (the datamodo row id) plus a
 * `dm_synced_at timestamptz`; ON CONFLICT (dm_id) DO UPDATE makes re-sync
 * idempotent — the user's table converges to datamodo, never accumulates
 * duplicates. Column order is stable (schema order) so the plan is
 * deterministic and unit-testable.
 */
export function buildSyncPlan(tableName: string, columns: DatasetColumn[]): SyncPlan {
  const table = safeTableName(tableName);
  const qTable = quoteIdent(table);

  // De-dupe column keys (a malformed schema shouldn't emit two of the same);
  // dm_id / dm_synced_at are reserved and never overwritten by a data column.
  const seen = new Set<string>(["dm_id", "dm_synced_at"]);
  const cols = columns.filter((c) => c.key && !seen.has(c.key) && (seen.add(c.key), true));

  const colDefs = cols.map((c) => `${quoteIdent(c.key)} ${pgType(c.type)}`);
  const createTable =
    `CREATE TABLE IF NOT EXISTS ${qTable} (\n` +
    `  dm_id text PRIMARY KEY,\n` +
    `  dm_synced_at timestamptz NOT NULL DEFAULT now()` +
    (colDefs.length ? ",\n  " + colDefs.join(",\n  ") : "") +
    `\n)`;

  const addColumns = cols.map(
    (c) => `ALTER TABLE ${qTable} ADD COLUMN IF NOT EXISTS ${quoteIdent(c.key)} ${pgType(c.type)}`,
  );

  // Upsert: dm_id ($1), then each data column ($2..), dm_synced_at = now().
  const paramKeys = ["dm_id", ...cols.map((c) => c.key)];
  const insertCols = [quoteIdent("dm_id"), ...cols.map((c) => quoteIdent(c.key)), quoteIdent("dm_synced_at")];
  const placeholders = [...paramKeys.map((_, i) => `$${i + 1}`), "now()"];
  const updates = cols.map((c) => `${quoteIdent(c.key)} = EXCLUDED.${quoteIdent(c.key)}`);
  updates.push(`dm_synced_at = now()`);
  const upsert =
    `INSERT INTO ${qTable} (${insertCols.join(", ")})\n` +
    `VALUES (${placeholders.join(", ")})\n` +
    `ON CONFLICT (dm_id) DO UPDATE SET ${updates.join(", ")}`;

  return { createTable, addColumns, upsert, paramKeys, table };
}

/**
 * Coerce a row's stored cell values into the ordered parameter list for the
 * upsert. `number`/`date` columns get typed; everything else becomes text (or
 * NULL for empty). Pure — the shell binds these as query parameters, so no
 * value is ever interpolated into SQL.
 */
export function rowParams(row: SyncRow, columns: DatasetColumn[], paramKeys: string[]): (string | number | null)[] {
  const typeByKey = new Map(columns.map((c) => [c.key, c.type]));
  return paramKeys.map((key) => {
    if (key === "dm_id") return row.id;
    const raw = row.data[key];
    if (raw == null || raw === "") return null;
    const type = typeByKey.get(key);
    if (type === "number") {
      if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
      // Strip currency/formatting; an all-junk value strips to "" (Number("")
      // is 0, which would be a wrong datum) → NULL, not zero.
      const cleaned = String(raw).replace(/[^0-9.eE+-]/g, "");
      if (cleaned === "") return null;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    return String(raw);
  });
}
