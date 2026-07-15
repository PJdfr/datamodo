// LOCAL EDITION embedded database — a zero-setup Postgres for `datamodo serve`.
// pglite (Postgres compiled to WASM, with pgvector + pg_trgm) runs in-process
// and is exposed over a local socket via pglite-socket, so the app's
// @prisma/adapter-pg (node-postgres) talks to it exactly like a real server.
// No Docker, no install, no `DATABASE_URL` to configure — the user just runs
// `datamodo serve` and their private vault lives in ~/.datamodo/pgdata.
//
// The schema is built with `prisma db push` on first boot (correct dependency
// order from the model), then a small fixup swaps the two vector indexes from
// btree (which can't hold a 1536-dim vector) to hnsw, matching the cloud.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const EXTENSIONS = ["vector", "pg_trgm", "pgcrypto", "btree_gin", "btree_gist", '"uuid-ossp"'];

/**
 * Boot the embedded database. Returns { url, ensureSchema, stop }.
 * `appRoot` is the datamodo install dir (where prisma/schema.prisma lives);
 * `dataDir` is the user's data dir; `port` the local socket port.
 */
export async function startEmbeddedDb({ appRoot, dataDir, port = 54321, host = "127.0.0.1" }) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { btree_gin } = await import("@electric-sql/pglite/contrib/btree_gin");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  const { uuid_ossp } = await import("@electric-sql/pglite/contrib/uuid_ossp");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

  const pgDir = path.join(dataDir, "pgdata");
  const db = await PGlite.create({ dataDir: pgDir, extensions: { vector, pg_trgm, btree_gin, btree_gist, pgcrypto, uuid_ossp } });
  for (const e of EXTENSIONS) await db.exec(`create extension if not exists ${e};`);

  const server = new PGLiteSocketServer({ db, port, host });
  await server.start();
  const url = `postgresql://postgres:postgres@${host}:${port}/postgres?sslmode=disable`;

  /** Build the schema on first boot (idempotent; a marker records the app
   *  version it was built for, so an upgrade re-pushes). */
  async function ensureSchema(appVersion) {
    const marker = path.join(dataDir, ".schema-version");
    const have = await fs.readFile(marker, "utf8").catch(() => "");
    if (have.trim() === String(appVersion)) return;

    console.log("datamodo: preparing your local database (first run)…");
    const status = await new Promise((res) => {
      const p = spawn(
        "npx",
        ["prisma", "db", "push", "--url", url, "--accept-data-loss"],
        { cwd: appRoot, stdio: "inherit" },
      );
      p.on("exit", res);
      p.on("error", () => res(1));
    });
    if (status !== 0) throw new Error("Could not build the local database schema (prisma db push failed).");

    // Vector-index fixup: the Prisma model emits btree for `@@index([embedding])`,
    // which can't index a 1536-dim vector; the cloud uses hnsw/cosine. Swap them
    // (hnsw if the extension supports it here; otherwise leave unindexed — a
    // single-user vault does exact ANN scans just fine).
    for (const [idx, table] of [["entities_embedding_idx", "entities"], ["doc_chunks_embedding_idx", "doc_chunks"]]) {
      await db.exec(`drop index if exists ${idx};`);
      try {
        await db.exec(`create index ${idx} on public.${table} using hnsw (embedding public.vector_cosine_ops);`);
      } catch {
        /* exact scan without an index is correct, just slower — fine locally */
      }
    }
    await fs.writeFile(marker, String(appVersion));
    console.log("datamodo: database ready.");
  }

  async function stop() {
    try { await server.stop(); } catch { /* ignore */ }
    try { await db.close(); } catch { /* ignore */ }
  }

  return { url, ensureSchema, stop };
}
