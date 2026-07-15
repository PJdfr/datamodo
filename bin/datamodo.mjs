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
// NOTE (phase 1): booting requires the built Next app + a local Postgres
// (DATABASE_URL). The embedded database (pglite) that makes `serve` truly
// zero-dependency is phase 2 — until then `serve` guides the user to set
// DATABASE_URL. Everything else (single-user auth, fs blobs, dashboard LLM
// config) is wired.

import { Command } from "commander";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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
    console.log("");
    console.log("Next:");
    console.log("  1. Point datamodo at a local Postgres (with pgvector):");
    console.log("     export DATABASE_URL=postgres://localhost:5432/datamodo");
    console.log("     (embedded zero-setup database is coming — see the docs)");
    console.log("  2. datamodo serve");
    console.log("  3. Open the dashboard and set your LLM (API key or Ollama).");
  });

program
  .command("serve")
  .description("Run the dashboard on localhost (single-user, local storage)")
  .option("-d, --data-dir <path>", "where datamodo keeps your vault + files")
  .option("-p, --port <port>", "port to serve on", String(DEFAULT_PORT))
  .option("-H, --host <host>", "host to bind", "127.0.0.1")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    await fs.mkdir(cfg.blobDir, { recursive: true });

    if (!cfg.databaseUrl) {
      console.error("✗ No database configured.");
      console.error("  datamodo needs a Postgres with pgvector. Set DATABASE_URL, e.g.:");
      console.error("    export DATABASE_URL=postgres://localhost:5432/datamodo");
      console.error("  Then apply the schema (neon/schema.sql) and re-run `datamodo serve`.");
      console.error("  (The embedded zero-setup database is on the roadmap — phase 2.)");
      process.exitCode = 1;
      return;
    }

    // Boot the built Next server if present, else `next start` (dev/repo).
    const standalone = path.join(APP_ROOT, ".next", "standalone", "server.js");
    const hasStandalone = await fs.access(standalone).then(() => true, () => false);
    const [cmd, args] = hasStandalone
      ? [process.execPath, [standalone]]
      : ["npx", ["next", "start", "-p", String(cfg.port), "-H", cfg.host]];

    console.log(`datamodo → http://${cfg.host}:${cfg.port}  (single-user · local storage)`);
    const child = spawn(cmd, args, { cwd: APP_ROOT, env: serveEnv(cfg), stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
