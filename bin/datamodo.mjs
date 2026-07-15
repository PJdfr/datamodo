#!/usr/bin/env node
// datamodo — the LOCAL (self-hosted, single-user) edition CLI.
//
//   npm install -g datamodo   # (published package)
//   datamodo init             # scaffold ~/.datamodo
//   datamodo serve            # run the dashboard on http://localhost:4321
//
// The local edition is the SAME app in single-user mode: DATAMODO_LOCAL=1
// bypasses cloud auth (one fixed local identity), BLOB_DIR routes blob storage
// to the filesystem, and the LLM is configured from the dashboard (API key,
// Ollama, or any OpenAI-compatible server). This script only ORCHESTRATES —
// resolves paths, ensures the data dir, exports env, and boots the server.
//
// Env/serve contract (keep in sync with lib/local/config.ts — the app side):
//   DATAMODO_LOCAL=1 · BLOB_DIR=<dataDir>/blobs · PORT · HOSTNAME · DATABASE_URL
//
// The database is ZERO-SETUP: `serve` boots an embedded Postgres (pglite, with
// pgvector) behind a local socket and builds the schema on first run — no
// Docker, no install, no DATABASE_URL. Set DATABASE_URL yourself to point at
// your own Postgres instead. Booting the dashboard needs the built Next app
// (shipped in the published package; `next start` in the repo).

import { Command } from "commander";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startEmbeddedDb } from "../lib/local/embedded-db.mjs";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = 4321;

const expandHome = (p) => (p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);

function resolveConfig(opts) {
  const dataDir = expandHome(opts.dataDir || process.env.DATAMODO_DATA_DIR || "~/.datamodo");
  const port = Number(opts.port || process.env.DATAMODO_PORT || process.env.PORT || DEFAULT_PORT) || DEFAULT_PORT;
  return {
    dataDir,
    blobDir: process.env.BLOB_DIR ? expandHome(process.env.BLOB_DIR) : path.join(dataDir, "blobs"),
    port,
    host: opts.host || process.env.DATAMODO_HOST || "127.0.0.1",
    databaseUrl: (process.env.DATABASE_URL || "").trim() || null,
  };
}

/** The env that turns the shared app into its local single-user skin. */
function serveEnv(cfg) {
  const env = {
    ...process.env,
    DATAMODO_LOCAL: "1",
    BLOB_DIR: cfg.blobDir,
    PORT: String(cfg.port),
    HOSTNAME: cfg.host,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET || "local-single-user-no-remote-auth",
  };
  if (cfg.databaseUrl) env.DATABASE_URL = cfg.databaseUrl;
  return env;
}

const program = new Command();
program
  .name("datamodo")
  .description("datamodo — your private data vault, self-hosted and single-user")
  .version(pkg.version || "0.0.0", "-v, --version");

program
  .command("init")
  .description("Create the local data directory (~/.datamodo) and its blob store")
  .option("-d, --data-dir <path>", "where datamodo keeps your vault + files")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    await fs.mkdir(cfg.blobDir, { recursive: true });
    console.log(`✓ data dir ready:  ${cfg.dataDir}`);
    console.log(`  blobs:           ${cfg.blobDir}`);
    console.log(`  database:        ${path.join(cfg.dataDir, "pgdata")} (embedded — built on first serve)`);
    console.log("");
    console.log("Next:");
    console.log("  1. datamodo serve");
    console.log("  2. Open http://localhost:4321 and set your LLM (API key, Ollama, …).");
    console.log("  (No database to install — datamodo runs its own. Point DATABASE_URL");
    console.log("   at your own Postgres to use that instead.)");
  });

/** Find a free localhost TCP port for the embedded DB socket. */
function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

program
  .command("serve")
  .description("Run the dashboard on localhost (single-user, embedded database)")
  .option("-d, --data-dir <path>", "where datamodo keeps your vault + files")
  .option("-p, --port <port>", "port to serve on", String(DEFAULT_PORT))
  .option("-H, --host <host>", "host to bind", "127.0.0.1")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    await fs.mkdir(cfg.blobDir, { recursive: true });

    // Zero-setup database: boot the embedded Postgres unless the user pointed
    // DATABASE_URL at their own server.
    let db = null;
    if (!cfg.databaseUrl) {
      const pgPort = await freePort();
      db = await startEmbeddedDb({ appRoot: APP_ROOT, dataDir: cfg.dataDir, port: pgPort });
      await db.ensureSchema(pkg.version || "0");
      cfg.databaseUrl = db.url;
    }

    // Boot the built Next server if present, else `next start` (dev/repo).
    const standalone = path.join(APP_ROOT, ".next", "standalone", "server.js");
    const hasStandalone = await fs.access(standalone).then(() => true, () => false);
    const [cmd, args] = hasStandalone
      ? [process.execPath, [standalone]]
      : ["npx", ["next", "start", "-p", String(cfg.port), "-H", cfg.host]];

    console.log(`datamodo → http://${cfg.host}:${cfg.port}  (single-user · ${db ? "embedded db" : "your database"} · local files)`);
    const child = spawn(cmd, args, { cwd: APP_ROOT, env: serveEnv(cfg), stdio: "inherit" });
    const shutdown = async () => { await db?.stop(); };
    child.on("exit", async (code) => { await shutdown(); process.exit(code ?? 0); });
    process.on("SIGINT", async () => { child.kill("SIGINT"); await shutdown(); process.exit(0); });
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
