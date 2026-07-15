// LOCAL EDITION config — the pure resolver for `datamodo serve` (self-hosted,
// single-user). Turns env + flags + defaults into the paths and settings the
// local runtime needs, with NO I/O so it unit-tests cleanly (the CLI does the
// actual mkdir / file reads and passes values in).
//
// Design: the local edition is the SAME app in a different skin —
// DATAMODO_LOCAL=1 flips single-user auth (one fixed local identity, no Neon
// Auth), fs blob storage (no S3/R2), and a local Postgres URL. Everything else
// (the pipeline, the vault, the dashboard, BYOK/Ollama LLM config) is
// unchanged. This module owns only the "where does local data live + how do we
// boot" decisions.

/** The fixed identity every local install runs as — there is exactly one user
 *  (the person at the keyboard), so auth is a constant, not a login. The UUID
 *  is stable so a re-serve reuses the same org/vault. */
export const LOCAL_USER = {
  // A fixed, valid v4-shaped UUID (hex only — an earlier value used "d0m0d",
  // whose `m` is NOT a hex digit, so Postgres rejected every query keyed on it:
  // the org wouldn't resolve, agents/chats couldn't be created). Stable so a
  // re-serve reuses the same org/vault. "d0d" ≈ a nod to datamodo, all hex.
  id: "00000000-0000-4000-8000-000000000d0d",
  email: "you@localhost",
  name: "You",
} as const;

export function isLocalMode(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.DATAMODO_LOCAL;
  return v === "1" || v === "true";
}

/** The local data dir the running app should read/write (connectors.json,
 *  cursors, …). `serve` exports `DATAMODO_DATA_DIR`; fall back to the parent of
 *  `BLOB_DIR` (which is `<dataDir>/blobs`), then to `~/.datamodo`. Pure-ish —
 *  reads env + HOME only, no fs. */
export function localDataDir(env: Record<string, string | undefined> = process.env): string {
  if (env.DATAMODO_DATA_DIR?.trim()) return env.DATAMODO_DATA_DIR.trim();
  const blob = env.BLOB_DIR?.trim();
  if (blob) return blob.replace(/\/+$/, "").replace(/\/blobs$/, "") || blob;
  const home = env.HOME || env.USERPROFILE || ".";
  return joinPath(home, ".datamodo");
}

export interface LocalConfig {
  /** Root data dir — vault DB, blobs, config all live under here. */
  dataDir: string;
  /** Where fs blobs are written (dataDir/blobs). */
  blobDir: string;
  /** Port the dashboard serves on. */
  port: number;
  /** Postgres URL the local runtime uses. Phase 2 boots an embedded pglite
   *  server and fills this in; until then it's the user's own local PG. */
  databaseUrl: string | null;
  /** The host to bind — localhost only by default (it's a personal server). */
  host: string;
}

const DEFAULT_PORT = 4321;

/** Expand a leading `~/` against the home dir (pure — home is passed in). */
export function expandHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return `${home.replace(/\/$/, "")}/${p.slice(2)}`;
  return p;
}

/** Join path segments with a single "/" (POSIX; the CLI passes a normalized
 *  home so Windows users get forward slashes that Node accepts anyway). */
export function joinPath(...parts: string[]): string {
  return parts
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, "") : p.replace(/^\/+|\/+$/g, "")))
    .filter(Boolean)
    .join("/");
}

export interface ResolveInput {
  env?: Record<string, string | undefined>;
  /** CLI flags (override env). */
  flags?: { dataDir?: string; port?: number | string; host?: string };
  /** The user's home dir (the CLI passes os.homedir()). */
  home: string;
}

/**
 * Resolve the local runtime config. Precedence: flags → env → default. The
 * data dir defaults to ~/.datamodo; `DATABASE_URL` (if set) is honored so a
 * user can point at their own Postgres before the embedded DB lands.
 */
export function resolveLocalConfig({ env = {}, flags = {}, home }: ResolveInput): LocalConfig {
  const dataDirRaw = flags.dataDir ?? env.DATAMODO_DATA_DIR ?? "~/.datamodo";
  const dataDir = expandHome(dataDirRaw, home);
  const portRaw = flags.port ?? env.DATAMODO_PORT ?? env.PORT ?? DEFAULT_PORT;
  const port = Number(portRaw);
  return {
    dataDir,
    blobDir: env.BLOB_DIR ? expandHome(env.BLOB_DIR, home) : joinPath(dataDir, "blobs"),
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    databaseUrl: env.DATABASE_URL?.trim() || null,
    host: flags.host ?? env.DATAMODO_HOST ?? "127.0.0.1",
  };
}

/**
 * Local embeddings default to a local Ollama server + model so semantic search
 * works offline out of the box — but ONLY when no cloud embeddings provider is
 * configured (an OpenAI/embeddings key or a custom base URL), so an OpenAI-key
 * user keeps their own 1536-dim provider. `nomic-embed-text` is Ollama's
 * standard embed model (768-dim); the embedded DB builds the vector column to
 * match. Pure — reads env only. (Mirrors `embeddingDefaults` in bin/datamodo.mjs.)
 */
export function localEmbeddingDefaults(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const hasCloud = (env.EMBEDDINGS_API_KEY || env.OPENAI_API_KEY || env.EMBEDDINGS_BASE_URL || "").trim();
  if (hasCloud) return {};
  return {
    EMBEDDINGS_BASE_URL: "http://localhost:11434/v1",
    EMBEDDINGS_MODEL: env.EMBEDDINGS_MODEL?.trim() || "nomic-embed-text",
    EMBEDDINGS_COLUMN_DIM: env.EMBEDDINGS_COLUMN_DIM?.trim() || "768",
  };
}

/** Per-user LLM model overrides (local edition) — the model NAMES to request
 *  from the chosen provider, settable from the dashboard so it's not env-only.
 *  Empty fields fall through to the env override, then the built-in default. */
export interface LocalLlmModels {
  /** The text-extraction model (the workhorse). */
  extract?: string;
  /** The "try harder" model for low-confidence escalation. */
  escalate?: string;
  /** The vision model — images and scanned-PDF OCR. */
  vision?: string;
}

/** Where the model overrides live inside the data dir. */
export const LOCAL_LLM_FILE = "llm.json";

/** Validate/normalize raw model config into typed overrides (trim, drop blanks).
 *  Pure — the route + runtime reader share it. */
export function sanitizeLlmModels(raw: unknown): LocalLlmModels {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const out: LocalLlmModels = {};
  const extract = str(o.extract);
  const escalate = str(o.escalate);
  const vision = str(o.vision);
  if (extract) out.extract = extract;
  if (escalate) out.escalate = escalate;
  if (vision) out.vision = vision;
  return out;
}

/** The env a local `serve` exports before booting the app — turns the shared
 *  app into its local skin. Returned as a plain map so the CLI can merge it
 *  into the child process env (pure — no process mutation here). */
export function localServeEnv(cfg: LocalConfig): Record<string, string> {
  const out: Record<string, string> = {
    DATAMODO_LOCAL: "1",
    BLOB_DIR: cfg.blobDir,
    PORT: String(cfg.port),
    HOSTNAME: cfg.host,
    // Single-user mode needs no Neon Auth; placeholders keep the auth lib from
    // throwing at import (its session/middleware path is bypassed in local mode).
    NEON_AUTH_COOKIE_SECRET: "local-single-user-no-remote-auth",
    NEON_AUTH_BASE_URL: "http://local.invalid",
    // Offline-first semantic search (no-op when a cloud embeddings key is set).
    ...localEmbeddingDefaults(),
  };
  if (cfg.databaseUrl) out.DATABASE_URL = cfg.databaseUrl;
  return out;
}
