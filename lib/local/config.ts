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
  id: "00000000-0000-0000-0000-0000000d0m0d", // "d0m0d" ≈ "domod" — stable, valid v4-shaped
  email: "you@localhost",
  name: "You",
} as const;

export function isLocalMode(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.DATAMODO_LOCAL;
  return v === "1" || v === "true";
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
  };
  if (cfg.databaseUrl) out.DATABASE_URL = cfg.databaseUrl;
  return out;
}
