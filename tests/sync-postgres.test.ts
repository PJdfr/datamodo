// Unit tests for the outbound-sync SQL core (lib/datamodo/sync-postgres.ts) —
// the DDL + parameterized upsert that pushes a table to the user's Postgres.
// Everything here is pure string/param building; no database. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSyncPlan,
  rowParams,
  safeTableName,
  quoteIdent,
  pgType,
} from "../lib/datamodo/sync-postgres.ts";
import type { DatasetColumn } from "../lib/datamodo/types.ts";

const COLS: DatasetColumn[] = [
  { key: "vendor", label: "Vendor", type: "text" },
  { key: "amount", label: "Amount", type: "number" },
  { key: "due", label: "Due", type: "date" },
];

test("safeTableName: snake_cases, strips junk, never starts with a digit", () => {
  assert.equal(safeTableName("Unpaid Invoices!"), "unpaid_invoices");
  assert.equal(safeTableName("  weird---name  "), "weird_name");
  assert.equal(safeTableName("2024 report"), "t2024_report");
  assert.equal(safeTableName(""), "datamodo_table");
  assert.equal(safeTableName("a".repeat(80)).length, 63);
});

test("quoteIdent: double-quotes and escapes; pgType maps datamodo→pg", () => {
  assert.equal(quoteIdent("amount"), '"amount"');
  assert.equal(quoteIdent('a"b'), '"a""b"');
  assert.throws(() => quoteIdent("bad\0name"));
  assert.equal(pgType("number"), "double precision");
  assert.equal(pgType("date"), "date");
  assert.equal(pgType("status"), "text");
  assert.equal(pgType("anything-else"), "text");
});

test("buildSyncPlan: DDL carries dm_id PK + typed columns; upsert is parameterized", () => {
  const p = buildSyncPlan("Unpaid Invoices", COLS);
  assert.equal(p.table, "unpaid_invoices");
  assert.match(p.createTable, /CREATE TABLE IF NOT EXISTS "unpaid_invoices"/);
  assert.match(p.createTable, /dm_id text PRIMARY KEY/);
  assert.match(p.createTable, /"amount" double precision/);
  assert.match(p.createTable, /"due" date/);
  assert.equal(p.addColumns.length, 3);
  assert.match(p.addColumns[0], /ADD COLUMN IF NOT EXISTS "vendor" text/);

  // dm_id is $1, then the three columns $2..$4, dm_synced_at = now() (no param).
  assert.deepEqual(p.paramKeys, ["dm_id", "vendor", "amount", "due"]);
  assert.match(p.upsert, /INSERT INTO "unpaid_invoices"/);
  assert.match(p.upsert, /VALUES \(\$1, \$2, \$3, \$4, now\(\)\)/);
  assert.match(p.upsert, /ON CONFLICT \(dm_id\) DO UPDATE SET/);
  assert.match(p.upsert, /"amount" = EXCLUDED\."amount"/);
  assert.match(p.upsert, /dm_synced_at = now\(\)/);
});

test("buildSyncPlan: reserved names and duplicate keys can't collide with dm_id", () => {
  const cols: DatasetColumn[] = [
    { key: "dm_id", label: "sneaky", type: "text" },
    { key: "x", label: "X", type: "text" },
    { key: "x", label: "dup", type: "number" },
  ];
  const p = buildSyncPlan("t", cols);
  assert.deepEqual(p.paramKeys, ["dm_id", "x"], "dm_id reserved; duplicate x dropped");
});

test("rowParams: values coerce by column type and follow paramKeys order", () => {
  const p = buildSyncPlan("t", COLS);
  const params = rowParams(
    { id: "row-1", data: { vendor: "Acme", amount: "$4,200.50", due: "2026-08-01" } },
    COLS,
    p.paramKeys,
  );
  assert.deepEqual(params, ["row-1", "Acme", 4200.5, "2026-08-01"]);
});

test("rowParams: blanks and unparseable numbers become NULL", () => {
  const p = buildSyncPlan("t", COLS);
  const params = rowParams({ id: "r2", data: { vendor: "", amount: "n/a" } }, COLS, p.paramKeys);
  assert.deepEqual(params, ["r2", null, null, null]);
});
