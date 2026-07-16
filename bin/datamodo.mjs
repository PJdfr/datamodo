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
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startEmbeddedDb } from "../lib/local/embedded-db.mjs";
import { startConnectors, loadConnectors, addConnector, removeConnector } from "../lib/local/connectors/imap-poll.mjs";
import { runFirstRunSetup } from "../lib/local/setup.mjs";
import { linkBuildExternals } from "./link-externals.mjs";

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

/**
 * Local embeddings default to a local Ollama server + model so semantic search
 * works fully offline out of the box — BUT only when the user hasn't already
 * configured a cloud embeddings provider (an OpenAI/embeddings key or a custom
 * base URL). Explicit config always wins, so an OpenAI-key user keeps their
 * 1536-dim provider untouched. `nomic-embed-text` is Ollama's standard embed
 * model (768-dim); the DB column is built to match (see EMBEDDINGS_COLUMN_DIM).
 * Returns {} when a cloud provider is configured.
 */
function embeddingDefaults(env = process.env) {
  const hasCloud = (env.EMBEDDINGS_API_KEY || env.OPENAI_API_KEY || env.EMBEDDINGS_BASE_URL || "").trim();
  if (hasCloud) return {};
  return {
    EMBEDDINGS_BASE_URL: "http://localhost:11434/v1", // Ollama's OpenAI-compatible endpoint
    EMBEDDINGS_MODEL: env.EMBEDDINGS_MODEL || "nomic-embed-text",
    EMBEDDINGS_COLUMN_DIM: env.EMBEDDINGS_COLUMN_DIM || "768",
  };
}

/** The pgvector column dimension the embedded DB should build, given the
 *  resolved embeddings config (768 for the local Ollama default, else 1536). */
function embeddingColumnDim(env = process.env) {
  const d = Number(embeddingDefaults(env).EMBEDDINGS_COLUMN_DIM ?? env.EMBEDDINGS_COLUMN_DIM ?? 1536);
  return Number.isInteger(d) && d > 0 ? d : 1536;
}

/** The env that turns the shared app into its local single-user skin. */
function serveEnv(cfg) {
  const env = {
    ...process.env,
    DATAMODO_LOCAL: "1",
    DATAMODO_DATA_DIR: cfg.dataDir,
    BLOB_DIR: cfg.blobDir,
    PORT: String(cfg.port),
    HOSTNAME: cfg.host,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET || "local-single-user-no-remote-auth",
    // Shared secret the in-process IMAP poller uses to POST captured mail to
    // the local /api/local/imap route (same trust boundary as the cloud webhook).
    INGEST_WEBHOOK_SECRET: cfg.ingestSecret,
    // MCP bearer tokens must not derive from the CONSTANT local cookie
    // placeholder (forgeable) — use the random per-install secret instead.
    MCP_TOKEN_SECRET: process.env.MCP_TOKEN_SECRET || cfg.ingestSecret,
    // The local default compute is a host Ollama (keyless, private). BYOK is a
    // Settings toggle on top of this — never a reinstall.
    LLM_PROVIDER: process.env.LLM_PROVIDER || "ollama",
    // Offline-first semantic search (no-op when a cloud embeddings key is set).
    ...embeddingDefaults(),
  };
  if (cfg.databaseUrl) env.DATABASE_URL = cfg.databaseUrl;
  // Tells lib/prisma.ts to apply the pglite single-connection workaround. A
  // real Postgres (user DATABASE_URL / compose) gets a normal pool instead.
  if (cfg.embeddedDb) env.DATAMODO_EMBEDDED_DB = "1";
  return env;
}

/** A stable per-install ingest secret, persisted so restarts reuse it (and the
 *  poller + route always agree). */
async function ensureIngestSecret(dataDir) {
  const file = path.join(dataDir, ".ingest-secret");
  try {
    const existing = (await fs.readFile(file, "utf8")).trim();
    if (existing) return existing;
  } catch { /* create below */ }
  const secret = randomBytes(32).toString("hex");
  await fs.writeFile(file, secret);
  await fs.chmod(file, 0o600).catch(() => {});
  return secret;
}

/** Wait until the dashboard responds (any HTTP status) or time out. */
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: "HEAD" });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
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

/** Resolve a locally-installed CLI's JS entry (…/<pkg>/<bin>) so we can run it
 *  with `node <entry>` — portable, and free of the npx/.cmd/shell pitfalls that
 *  break spawning on Windows. */
function cliEntry(pkgName) {
  const p = require(`${pkgName}/package.json`);
  const bin = typeof p.bin === "string" ? p.bin : p.bin[pkgName];
  return path.join(path.dirname(require.resolve(`${pkgName}/package.json`)), bin);
}

/** True once a COMPLETE production build exists. We check prerender-manifest.json
 *  — written at the very END of a successful build and required by `next start`
 *  — rather than BUILD_ID (written early during compile). A build that failed or
 *  was interrupted leaves BUILD_ID but not this, so it's correctly seen as
 *  "needs (re)build" instead of crashing `next start` on a missing manifest. */
function hasBuild() {
  return fs.access(path.join(APP_ROOT, ".next", "prerender-manifest.json")).then(() => true, () => false);
}

/** Run `next build` in LOCAL mode. Setting DATAMODO_LOCAL=1 here is what keeps
 *  the build from prerendering /dashboard in cloud mode (which needs Neon Auth
 *  secrets) — the #1 setup footgun. We set it for the user so they never have to
 *  remember it (or fight `$env:` / inline-env syntax across shells). */
function runNextBuild() {
  return new Promise((res, rej) => {
    console.log("datamodo: building the app (first run — this takes a minute)…");
    const p = spawn(process.execPath, [cliEntry("next"), "build"], {
      cwd: APP_ROOT,
      env: { ...process.env, DATAMODO_LOCAL: "1", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`next build failed (exit ${code})`))));
    p.on("error", rej);
  });
}

program
  .command("build")
  .description("Rebuild the app for local use, cleanly (sets DATAMODO_LOCAL for you)")
  .action(async () => {
    // Always a CLEAN rebuild: clear .next so a code change (e.g. after `git
    // pull`) can't be masked by a stale build that `serve` would happily reuse.
    await fs.rm(path.join(APP_ROOT, ".next"), { recursive: true, force: true });
    await runNextBuild();
    console.log("✓ built — now run: datamodo serve");
  });

program
  .command("setup")
  .description("Size the local AI to this machine: RAM budget → model tier → pull")
  .option("-d, --data-dir <path>", "where datamodo keeps your vault + files")
  .option("--ram <gb>", "RAM budget in GB (default: detected)")
  .option("--ollama-url <url>", "Ollama server (default http://localhost:11434)")
  .option("-y, --yes", "accept the detected tier without asking")
  .option("--force", "re-run even if models are already configured")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    await fs.mkdir(cfg.dataDir, { recursive: true });
    const r = await runFirstRunSetup({
      dataDir: cfg.dataDir,
      interactive: !opts.yes,
      ram: opts.ram,
      ollamaUrl: opts.ollamaUrl,
      force: Boolean(opts.force),
    });
    if (!r.ran && r.reason === "configured") {
      console.log("Models are already configured (~/.datamodo/llm.json) — use --force to re-size, or edit them in Settings.");
    }
  });

program
  .command("serve")
  .description("Run the dashboard on localhost (single-user, embedded database)")
  .option("-d, --data-dir <path>", "where datamodo keeps your vault + files")
  .option("-p, --port <port>", "port to serve on", String(DEFAULT_PORT))
  .option("-H, --host <host>", "host to bind", "127.0.0.1")
  .option("--skip-setup", "don't run the first-run model sizing")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    await fs.mkdir(cfg.blobDir, { recursive: true });
    cfg.ingestSecret = await ensureIngestSecret(cfg.dataDir);

    // First run only (no llm.json yet): size the local AI to this machine —
    // detect RAM, pick a model tier, pull from Ollama. Interactive on a TTY;
    // silent defaults otherwise. Fail-soft: no Ollama → hint + keep booting.
    if (!opts.skipSetup) {
      await runFirstRunSetup({ dataDir: cfg.dataDir, interactive: Boolean(process.stdin.isTTY) });
    }

    // The published package SHIPS the production build — restore its
    // externalized-package links if postinstall couldn't (copied installs,
    // skipped scripts). Fail-soft: worst case the build check below rebuilds.
    try {
      const { missing } = await linkBuildExternals(APP_ROOT);
      for (const m of missing) console.warn(`datamodo: build external "${m}" is not installed — run npm install`);
    } catch { /* rebuild path below covers it */ }

    // Auto-build on first run (or after a clean) so the user never has to run
    // `next build` by hand — and never has to remember DATAMODO_LOCAL=1, which
    // is the difference between a working local build and a /dashboard prerender
    // crash asking for cloud auth secrets. The published package ships prebuilt,
    // so this is the repo/dev fallback (and the `datamodo build` clean path).
    if (!(await hasBuild())) {
      // Clear any partial `.next` from a failed/interrupted build first — a
      // half-written build makes `next start` crash on a missing manifest.
      await fs.rm(path.join(APP_ROOT, ".next"), { recursive: true, force: true });
      await runNextBuild();
    }

    // Zero-setup database: boot the embedded Postgres unless the user pointed
    // DATABASE_URL at their own server.
    let db = null;
    if (!cfg.databaseUrl) {
      const pgPort = await freePort();
      db = await startEmbeddedDb({ appRoot: APP_ROOT, dataDir: cfg.dataDir, port: pgPort });
      await db.ensureSchema(pkg.version || "0", { embeddingDim: embeddingColumnDim() });
      cfg.databaseUrl = db.url;
      cfg.embeddedDb = true;
    }

    // Boot the built Next server if present, else `next start` (dev/repo). Run
    // the Next CLI's JS entry with the current node binary — going through `npx`
    // breaks on Windows (bare "npx" → ENOENT; npx.cmd → EINVAL without a shell).
    const standalone = path.join(APP_ROOT, ".next", "standalone", "server.js");
    const hasStandalone = await fs.access(standalone).then(() => true, () => false);
    const [cmd, args] = hasStandalone
      ? [process.execPath, [standalone]]
      : [process.execPath, [cliEntry("next"), "start", "-p", String(cfg.port), "-H", cfg.host]];

    console.log(`datamodo → http://${cfg.host}:${cfg.port}  (single-user · ${db ? "embedded db" : "your database"} · local files)`);
    const child = spawn(cmd, args, { cwd: APP_ROOT, env: serveEnv(cfg), stdio: "inherit" });

    // BYOB capture: once the dashboard is up, poll any configured mailboxes
    // (connectors.json) and feed new mail through the same pipeline. Best-effort
    // — a connector problem never takes the dashboard down.
    let connectors = null;
    (async () => {
      const base = `http://${cfg.host === "0.0.0.0" ? "127.0.0.1" : cfg.host}:${cfg.port}`;
      if (!(await waitForServer(base))) return;
      try {
        connectors = await startConnectors({
          dataDir: cfg.dataDir,
          endpoint: `${base}/api/local/imap`,
          secret: cfg.ingestSecret,
        });
      } catch (e) {
        console.error(`datamodo: IMAP connectors failed to start — ${e?.message ?? e}`);
      }
    })();

    const shutdown = async () => { connectors?.stop(); await db?.stop(); };
    child.on("exit", async (code) => { await shutdown(); process.exit(code ?? 0); });
    // BOTH signals: `kill <pid>` sends SIGTERM — without this handler the
    // parent dies, the embedded DB dies with it, but the next-server child
    // survives as an orphan holding the port with a dead database.
    const stop = (sig) => async () => { child.kill(sig); await shutdown(); process.exit(0); };
    process.on("SIGINT", stop("SIGINT"));
    process.on("SIGTERM", stop("SIGTERM"));
  });

program
  .command("connect")
  .description("Connect a mailbox to pull mail from over IMAP (BYOB capture)")
  .option("-d, --data-dir <path>", "where datamodo keeps your vault + files")
  .option("--host <host>", "IMAP host, e.g. imap.gmail.com")
  .option("--port <port>", "IMAP port", String(993))
  .option("--user <user>", "mailbox login (usually your email)")
  .option("--pass <password>", "mailbox password or app-specific password")
  .option("--mailbox <name>", "folder to watch", "INBOX")
  .option("--id <id>", "stable connector id (defaults to user@host)")
  .option("--insecure", "use plaintext/STARTTLS (port 143) instead of implicit TLS")
  .option("--list", "list configured connectors")
  .option("--remove <id>", "remove a connector by id")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    await fs.mkdir(cfg.dataDir, { recursive: true });

    if (opts.list) {
      const list = await loadConnectors(cfg.dataDir);
      if (!list.length) return console.log("No connectors configured. Add one:\n  datamodo connect --host imap.example.com --user you@example.com --pass ****");
      for (const c of list) console.log(`  ${c.id}  →  ${c.user}@${c.host}:${c.port} (${c.mailbox})`);
      return;
    }

    if (opts.remove) {
      const removed = await removeConnector(cfg.dataDir, opts.remove);
      return console.log(removed ? `✓ removed ${opts.remove}` : `No connector with id "${opts.remove}".`);
    }

    if (!opts.host || !opts.user || !opts.pass) {
      return console.error("Need --host, --user and --pass (or use --list / --remove).");
    }
    const added = await addConnector(cfg.dataDir, {
      kind: "imap",
      id: opts.id,
      host: opts.host,
      port: Number(opts.port) || 993,
      secure: !opts.insecure,
      user: opts.user,
      password: opts.pass,
      mailbox: opts.mailbox || "INBOX",
    });
    console.log(`✓ connected ${added.id}  (${added.user}@${added.host})`);
    console.log("  New mail will be captured while `datamodo serve` is running.");
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
