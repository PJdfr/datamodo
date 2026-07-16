#!/usr/bin/env node
// datamodo local edition — Docker entrypoint. The container flavor of
// `datamodo serve`: same local skin (single user, fs blobs, host Ollama,
// first-run model sizing, IMAP poller), but the database is a REAL Postgres
// (compose provides it) instead of embedded pglite — so no single-connection
// shim, and the schema is installed here from neon/schema.sql.
//
// Env (compose sets these):
//   DATABASE_URL         postgres://…  (required)
//   DATAMODO_DATA_DIR    /data         (volume: blobs, llm.json, connectors, secrets)
//   OLLAMA_BASE_URL      http://host.docker.internal:11434  (host Ollama — §7:
//                        macOS containers can't use the GPU, so Ollama lives on
//                        the host by default; the compose `gpu` profile swaps in
//                        a containerized one on Linux/NVIDIA)
//   DATAMODO_RAM_GB      optional RAM budget override for first-run sizing

import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runFirstRunSetup } from "../lib/local/setup.mjs";
import { startConnectors } from "../lib/local/connectors/imap-poll.mjs";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const dataDir = process.env.DATAMODO_DATA_DIR || "/data";
const blobDir = process.env.BLOB_DIR || path.join(dataDir, "blobs");
const port = Number(process.env.PORT) || 4321;
const host = process.env.HOSTNAME || "0.0.0.0";
const databaseUrl = (process.env.DATABASE_URL || "").trim();
const ollamaUrl = (process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434").replace(/\/v1\/?$/, "");

if (!databaseUrl) {
  console.error("datamodo: DATABASE_URL is required in Docker (compose sets it).");
  process.exit(1);
}

async function ensureSecret(file) {
  const p = path.join(dataDir, file);
  try {
    const existing = (await fs.readFile(p, "utf8")).trim();
    if (existing) return existing;
  } catch { /* create below */ }
  const secret = randomBytes(32).toString("hex");
  await fs.writeFile(p, secret);
  await fs.chmod(p, 0o600).catch(() => {});
  return secret;
}

/** Wait for Postgres to accept connections (compose healthcheck usually beats
 *  us here, but a fresh volume's first initdb can race). */
async function waitForDb(pg, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const c = new pg.Client({ connectionString: databaseUrl });
    try {
      await c.connect();
      await c.end();
      return;
    } catch {
      await c.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`could not reach the database at ${databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
}

/** Install/upgrade the schema. Fresh DB → load neon/schema.sql faithfully
 *  (dim-rewritten for local embeddings). Existing DB with a stale version
 *  marker → `prisma db push` diff-sync (never drops data) + hnsw restore. */
async function ensureSchema(pg, embeddingDim) {
  const marker = path.join(dataDir, ".schema-version");
  const want = `${pkg.version || "0"}:${embeddingDim}`;
  const have = await fs.readFile(marker, "utf8").catch(() => "");
  if (have.trim() === want) return;

  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    const fresh = (await c.query(
      "select 1 from information_schema.tables where table_schema='public' and table_name='organizations'",
    )).rows.length === 0;

    if (fresh) {
      console.log("datamodo: preparing your database (first run)…");
      let sql = await fs.readFile(path.join(APP_ROOT, "neon", "schema.sql"), "utf8");
      if (embeddingDim !== 1536) sql = sql.replaceAll("vector(1536)", `vector(${embeddingDim})`);
      await c.query(sql);
    } else {
      console.log("datamodo: updating your database schema…");
      const prismaPkg = require("prisma/package.json");
      const bin = typeof prismaPkg.bin === "string" ? prismaPkg.bin : prismaPkg.bin?.prisma;
      const cli = path.join(path.dirname(require.resolve("prisma/package.json")), bin);
      const status = await new Promise((res) => {
        const p = spawn(process.execPath, [cli, "db", "push", "--url", databaseUrl, "--accept-data-loss"], { cwd: APP_ROOT, stdio: "inherit" });
        p.on("exit", res);
        p.on("error", (e) => { console.error(`datamodo: could not run prisma — ${e?.message ?? e}`); res(1); });
      });
      if (status !== 0) throw new Error("schema update failed (prisma db push) — see above.");
      for (const [idx, table] of [["entities_embedding_idx", "entities"], ["doc_chunks_embedding_idx", "doc_chunks"]]) {
        try {
          await c.query(`drop index if exists ${idx}`);
          await c.query(`create index ${idx} on public.${table} using hnsw (embedding public.vector_cosine_ops)`);
        } catch { /* exact scan is correct, just slower */ }
      }
    }
    await fs.writeFile(marker, want);
    console.log("datamodo: database ready.");
  } finally {
    await c.end();
  }
}

/* ------------------------------------------------------------------ */

await fs.mkdir(blobDir, { recursive: true });
const ingestSecret = await ensureSecret(".ingest-secret");

// Local embeddings ride the same host Ollama unless a cloud provider is set.
const hasCloudEmbeddings = (process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || process.env.EMBEDDINGS_BASE_URL || "").trim();
const embeddingDim = hasCloudEmbeddings ? Number(process.env.EMBEDDINGS_COLUMN_DIM || 1536) : Number(process.env.EMBEDDINGS_COLUMN_DIM || 768);

const pg = (await import("pg")).default;
await waitForDb(pg);
await ensureSchema(pg, Number.isInteger(embeddingDim) && embeddingDim > 0 ? embeddingDim : 1536);

// First-run model sizing (non-interactive): container RAM (cgroup) → tier →
// pull via the host Ollama. Fail-soft — no Ollama just prints the hint.
await runFirstRunSetup({
  dataDir,
  interactive: false,
  ram: process.env.DATAMODO_RAM_GB,
  ollamaUrl,
});

const env = {
  ...process.env,
  DATAMODO_LOCAL: "1",
  DATAMODO_DATA_DIR: dataDir,
  BLOB_DIR: blobDir,
  PORT: String(port),
  HOSTNAME: host,
  NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET || "local-single-user-no-remote-auth",
  INGEST_WEBHOOK_SECRET: ingestSecret,
  LLM_PROVIDER: process.env.LLM_PROVIDER || "ollama",
  OLLAMA_BASE_URL: ollamaUrl,
  ...(hasCloudEmbeddings ? {} : {
    EMBEDDINGS_BASE_URL: `${ollamaUrl}/v1`,
    EMBEDDINGS_MODEL: process.env.EMBEDDINGS_MODEL || "nomic-embed-text",
    EMBEDDINGS_COLUMN_DIM: String(embeddingDim),
  }),
  // REAL Postgres — the pglite single-connection shim stays off.
  // (DATAMODO_EMBEDDED_DB deliberately unset.)
};

console.log(`datamodo → http://localhost:${port}  (docker · your database · local files)`);
const nextPkg = require("next/package.json");
const nextBin = path.join(path.dirname(require.resolve("next/package.json")), typeof nextPkg.bin === "string" ? nextPkg.bin : nextPkg.bin.next);
const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", host], { cwd: APP_ROOT, env, stdio: "inherit" });

// BYOB capture (IMAP poller) — same as serve; best-effort.
let connectors = null;
(async () => {
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { await fetch(base, { method: "HEAD" }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  try {
    connectors = await startConnectors({ dataDir, endpoint: `${base}/api/local/imap`, secret: ingestSecret });
  } catch (e) {
    console.error(`datamodo: IMAP connectors failed to start — ${e?.message ?? e}`);
  }
})();

const shutdown = () => { connectors?.stop(); };
child.on("exit", (code) => { shutdown(); process.exit(code ?? 0); });
process.on("SIGTERM", () => { child.kill("SIGTERM"); shutdown(); });
process.on("SIGINT", () => { child.kill("SIGINT"); shutdown(); });
