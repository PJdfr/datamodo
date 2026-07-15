// OUTBOUND SYNC shell — opens the user's Postgres and runs the plan the pure
// core (sync-postgres.ts) produced. Every WRITER lives behind ONE interface
// (the roadmap's design rule, like lib/storage/blob.ts) so Sheets / Drive /
// local-fs writers slot in later without touching callers. Phase 1 ships the
// Postgres writer; the interface is the seam.
//
// Server-only (imports `pg`). Fail-soft: a bad connection string or an
// unreachable host returns an error message, never throws past the action.

import { Pool } from "pg";
import type { DatasetColumn } from "./types";
import { buildSyncPlan, rowParams, type SyncRow } from "./sync-postgres.ts";

export interface SyncTarget {
  /** Postgres connection string (postgres://user:pass@host:port/db). */
  connectionString: string;
  /** The table to write (sanitized by the core). */
  table: string;
}

export interface SyncResult {
  ok: boolean;
  /** Rows upserted (created + updated — Postgres doesn't distinguish cheaply). */
  synced: number;
  /** The actual quoted table name written. */
  table: string;
  error?: string;
}

/** One writer per destination kind — the interface future connectors implement. */
export interface OutboundWriter {
  push(
    target: SyncTarget,
    columns: DatasetColumn[],
    rows: SyncRow[],
  ): Promise<SyncResult>;
}

// A short statement timeout keeps a wrong host / firewalled port from hanging
// the request; SSL is opportunistic (most hosted PG requires it, and
// rejectUnauthorized:false matches how psql `sslmode=require` behaves —
// we're pushing the user's own data to the user's own DB).
const CONNECT_TIMEOUT_MS = 8000;

export const postgresWriter: OutboundWriter = {
  async push(target, columns, rows) {
    const plan = buildSyncPlan(target.table, columns);
    let pool: Pool | null = null;
    try {
      pool = new Pool({
        connectionString: target.connectionString,
        max: 1,
        connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
        statement_timeout: 20000,
        ssl: needsSsl(target.connectionString) ? { rejectUnauthorized: false } : undefined,
      });
      const client = await pool.connect();
      try {
        await client.query(plan.createTable);
        for (const stmt of plan.addColumns) await client.query(stmt);
        let synced = 0;
        // One parameterized upsert per row (no interpolation). Batched under a
        // single connection; a per-row failure aborts the sync with a clear
        // message rather than leaving a half-written table silently.
        for (const row of rows) {
          await client.query(plan.upsert, rowParams(row, columns, plan.paramKeys));
          synced++;
        }
        return { ok: true, synced, table: plan.table };
      } finally {
        client.release();
      }
    } catch (e) {
      return { ok: false, synced: 0, table: plan.table, error: friendlyError(e) };
    } finally {
      await pool?.end().catch(() => {});
    }
  },
};

function needsSsl(conn: string): boolean {
  // Local targets rarely have SSL; hosted ones almost always require it.
  if (/sslmode=disable/.test(conn)) return false;
  if (/localhost|127\.0\.0\.1|::1/.test(conn)) return false;
  return true;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return "Couldn't resolve the database host — check the connection string.";
  if (/ECONNREFUSED/.test(msg)) return "Connection refused — is the host reachable from datamodo, and the port open?";
  if (/timeout|ETIMEDOUT/.test(msg)) return "Connection timed out — the host may be firewalled from datamodo's servers.";
  if (/password|authentication|role .* does not exist/i.test(msg)) return "Authentication failed — check the user and password.";
  if (/database .* does not exist/i.test(msg)) return "That database doesn't exist on the server.";
  if (/no pg_hba|SSL/i.test(msg)) return "The server rejected the SSL mode — try adding ?sslmode=require (or disable) to the string.";
  return `Sync failed: ${msg.slice(0, 160)}`;
}
