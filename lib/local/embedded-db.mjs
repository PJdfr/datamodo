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
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EXTENSIONS = ["vector", "pg_trgm", "pgcrypto", "btree_gin", "btree_gist", '"uuid-ossp"'];

// Resolve the Prisma CLI's JS entry so we can run it with `node <cli>` directly.
// Going through `npx` breaks on Windows two ways: the bare name "npx" isn't
// found (it's npx.cmd → ENOENT), and recent Node refuses to spawn a .cmd without
// a shell (EINVAL, CVE-2024-27980). Running the JS entry with the current node
// binary sidesteps both and is fully portable.
function prismaCli() {
  const pkg = require("prisma/package.json");
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.prisma;
  if (!bin) throw new Error("prisma CLI entry not found (is `prisma` installed?)");
  return path.join(path.dirname(require.resolve("prisma/package.json")), bin);
}

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
   *  version it was built for, so an upgrade re-pushes).
   *  `opts.embeddingDim` sizes the pgvector columns — the cloud is 1536
   *  (OpenAI text-embedding-3-small), but a local edition using a local model
   *  (Ollama `nomic-embed-text` = 768) needs the column to match or every
   *  vector is rejected at store time. Only applied on a FRESH build (the
   *  columns are empty), so it never has to migrate existing data. */
  async function ensureSchema(appVersion, opts = {}) {
    const rawDim = Number(opts.embeddingDim ?? process.env.EMBEDDINGS_COLUMN_DIM ?? 1536);
    const embeddingDim = Number.isInteger(rawDim) && rawDim > 0 && rawDim <= 16000 ? rawDim : 1536;
    const marker = path.join(dataDir, ".schema-version");
    const have = await fs.readFile(marker, "utf8").catch(() => "");
    const built = have.trim() === `${appVersion}:${embeddingDim}`;

    if (!built) {
      console.log("datamodo: preparing your local database (first run)…");
      let cli;
      try {
        cli = prismaCli();
      } catch (e) {
        throw new Error(`Could not locate the Prisma CLI — run \`npm install\` in the datamodo directory. (${e?.message ?? e})`);
      }
      const status = await new Promise((res) => {
        const p = spawn(
          process.execPath,
          [cli, "db", "push", "--url", url, "--accept-data-loss"],
          { cwd: appRoot, stdio: "inherit" },
        );
        p.on("exit", res);
        // Surface WHY it couldn't even start instead of swallowing it — that
        // silent path is what made this look opaque.
        p.on("error", (e) => { console.error(`datamodo: could not run prisma — ${e?.message ?? e}`); res(1); });
      });
      if (status !== 0) throw new Error("Could not build the local database schema (prisma db push failed) — see the output above.");

      // Vector columns + index fixup. Two things the Prisma push gets "cloud-shaped":
      //  (1) the column is vector(1536); a local model may emit a different dim, so
      //      resize it to match (empty table on a fresh build → safe).
      //  (2) `@@index([embedding])` emits btree, which can't index a vector; the
      //      cloud uses hnsw/cosine. Swap it (hnsw if the extension supports it
      //      here; otherwise leave unindexed — a single-user vault does exact ANN
      //      scans just fine).
      for (const [idx, table] of [["entities_embedding_idx", "entities"], ["doc_chunks_embedding_idx", "doc_chunks"]]) {
        await db.exec(`drop index if exists ${idx};`);
        if (embeddingDim !== 1536) {
          try {
            await db.exec(`alter table public.${table} alter column embedding type vector(${embeddingDim});`);
          } catch (e) {
            console.error(`datamodo: could not set ${table}.embedding to vector(${embeddingDim})`, e);
          }
        }
        try {
          await db.exec(`create index ${idx} on public.${table} using hnsw (embedding public.vector_cosine_ops);`);
        } catch {
          /* exact scan without an index is correct, just slower — fine locally */
        }
      }
      await fs.writeFile(marker, `${appVersion}:${embeddingDim}`);
      console.log(`datamodo: database ready${embeddingDim !== 1536 ? ` (embeddings ${embeddingDim}-dim)` : ""}.`);
    }

    // prisma db push builds TABLES + indexes, but never the custom SQL the app
    // relies on: the `private` schema, stored functions (knowledge_match_entities,
    // add/remove_dataset_column, dataset_accepted_counts, the refcount/updated_at
    // trigger fns) and their triggers — all defined in neon/schema.sql. Install
    // them from there. Idempotent (CREATE OR REPLACE / ignore "already exists"),
    // so it runs on EVERY boot and repairs installs built before this existed.
    await installCustomDdl();
  }

  /** Extract + apply the stored functions, triggers, and `private` schema from
   *  neon/schema.sql (which prisma db push does not create). */
  async function installCustomDdl() {
    let sql;
    try {
      sql = await fs.readFile(path.join(appRoot, "neon", "schema.sql"), "utf8");
    } catch {
      console.error("datamodo: neon/schema.sql not found — stored functions not installed (search & table edits may fail).");
      return;
    }
    try { await db.exec("create schema if not exists private;"); } catch { /* already there */ }

    // Functions are `CREATE FUNCTION … AS $$ … $$;` (plain $$ quoting). Make them
    // CREATE OR REPLACE so re-running is a no-op.
    for (const fn of sql.match(/CREATE\s+FUNCTION[\s\S]*?\$\$;/gi) ?? []) {
      try {
        await db.exec(fn.replace(/^CREATE\s+FUNCTION/i, "CREATE OR REPLACE FUNCTION"));
      } catch (e) {
        console.error("datamodo: could not install a stored function —", e?.message ?? e);
      }
    }
    // Triggers are single statements; CREATE errors if one already exists.
    for (const trg of sql.match(/CREATE\s+TRIGGER[\s\S]*?;/gi) ?? []) {
      try {
        await db.exec(trg);
      } catch (e) {
        if (!/already exists/i.test(String(e?.message ?? ""))) {
          console.error("datamodo: could not install a trigger —", e?.message ?? e);
        }
      }
    }
  }

  async function stop() {
    try { await server.stop(); } catch { /* ignore */ }
    try { await db.close(); } catch { /* ignore */ }
  }

  return { url, ensureSchema, stop };
}
