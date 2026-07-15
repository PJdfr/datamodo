// Unit tests for the local-edition config core (lib/local/config.ts) and the
// fs blob adapter (lib/storage/blob-fs.ts). Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isLocalMode,
  expandHome,
  joinPath,
  resolveLocalConfig,
  localServeEnv,
  localEmbeddingDefaults,
  localDataDir,
  sanitizeLlmModels,
  LOCAL_USER,
} from "../lib/local/config.ts";

test("isLocalMode: only 1/true flip it", () => {
  assert.equal(isLocalMode({ DATAMODO_LOCAL: "1" }), true);
  assert.equal(isLocalMode({ DATAMODO_LOCAL: "true" }), true);
  assert.equal(isLocalMode({ DATAMODO_LOCAL: "0" }), false);
  assert.equal(isLocalMode({}), false);
});

test("expandHome / joinPath", () => {
  assert.equal(expandHome("~/.datamodo", "/home/me"), "/home/me/.datamodo");
  assert.equal(expandHome("~", "/home/me"), "/home/me");
  assert.equal(expandHome("/abs/path", "/home/me"), "/abs/path");
  assert.equal(joinPath("/home/me/", "/.datamodo/", "blobs"), "/home/me/.datamodo/blobs");
});

test("resolveLocalConfig: flags beat env beat defaults", () => {
  const def = resolveLocalConfig({ home: "/home/me" });
  assert.equal(def.dataDir, "/home/me/.datamodo");
  assert.equal(def.blobDir, "/home/me/.datamodo/blobs");
  assert.equal(def.port, 4321);
  assert.equal(def.host, "127.0.0.1");
  assert.equal(def.databaseUrl, null);

  const env = resolveLocalConfig({ home: "/home/me", env: { DATAMODO_DATA_DIR: "~/vault", DATAMODO_PORT: "8080", DATABASE_URL: "postgres://x" } });
  assert.equal(env.dataDir, "/home/me/vault");
  assert.equal(env.port, 8080);
  assert.equal(env.databaseUrl, "postgres://x");

  const flags = resolveLocalConfig({ home: "/home/me", env: { DATAMODO_PORT: "8080" }, flags: { port: 9000, dataDir: "/data" } });
  assert.equal(flags.port, 9000, "flag beats env");
  assert.equal(flags.dataDir, "/data");
});

test("resolveLocalConfig: a bad port falls back to the default", () => {
  assert.equal(resolveLocalConfig({ home: "/h", flags: { port: "not-a-port" } }).port, 4321);
});

test("localServeEnv: turns the app into its local skin", () => {
  const cfg = resolveLocalConfig({ home: "/home/me", env: { DATABASE_URL: "postgres://x" } });
  const env = localServeEnv(cfg);
  assert.equal(env.DATAMODO_LOCAL, "1");
  assert.equal(env.BLOB_DIR, "/home/me/.datamodo/blobs");
  assert.equal(env.PORT, "4321");
  assert.equal(env.DATABASE_URL, "postgres://x");
  assert.ok(env.NEON_AUTH_COOKIE_SECRET, "a placeholder cookie secret keeps the auth lib import from throwing");

  // No DB set → DATABASE_URL absent (serve then guides the user).
  assert.equal(localServeEnv(resolveLocalConfig({ home: "/h" })).DATABASE_URL, undefined);
});

test("localEmbeddingDefaults: Ollama when no cloud key, respects explicit config", () => {
  // No cloud embeddings provider → default to a local Ollama server (768-dim).
  const d = localEmbeddingDefaults({});
  assert.equal(d.EMBEDDINGS_BASE_URL, "http://localhost:11434/v1");
  assert.equal(d.EMBEDDINGS_MODEL, "nomic-embed-text");
  assert.equal(d.EMBEDDINGS_COLUMN_DIM, "768");

  // A cloud key/URL is present → don't override it (keep their 1536 provider).
  assert.deepEqual(localEmbeddingDefaults({ OPENAI_API_KEY: "sk-x" }), {});
  assert.deepEqual(localEmbeddingDefaults({ EMBEDDINGS_BASE_URL: "https://api.openai.com/v1" }), {});

  // Explicit model/dim are respected when defaulting to Ollama.
  const d2 = localEmbeddingDefaults({ EMBEDDINGS_MODEL: "mxbai-embed-large", EMBEDDINGS_COLUMN_DIM: "1024" });
  assert.equal(d2.EMBEDDINGS_MODEL, "mxbai-embed-large");
  assert.equal(d2.EMBEDDINGS_COLUMN_DIM, "1024");
});

test("localDataDir: env → parent of BLOB_DIR → ~/.datamodo", () => {
  assert.equal(localDataDir({ DATAMODO_DATA_DIR: "/data/dm" }), "/data/dm");
  assert.equal(localDataDir({ BLOB_DIR: "/data/dm/blobs" }), "/data/dm");
  assert.equal(localDataDir({ HOME: "/home/me" }), "/home/me/.datamodo");
});

test("sanitizeLlmModels: trims, drops blanks, ignores junk", () => {
  assert.deepEqual(
    sanitizeLlmModels({ extract: "  llama3.1 ", vision: "llava", escalate: "", junk: 5 }),
    { extract: "llama3.1", vision: "llava" },
  );
  assert.deepEqual(sanitizeLlmModels({}), {});
  assert.deepEqual(sanitizeLlmModels(null), {});
  assert.deepEqual(sanitizeLlmModels({ extract: "   " }), {}); // whitespace-only → dropped
});

test("LOCAL_USER: a stable, VALID uuid identity", () => {
  assert.equal(LOCAL_USER.email, "you@localhost");
  // Must be a real UUID — it's the primary key Postgres queries against. A
  // non-hex char (e.g. the earlier "d0m0d") makes every keyed query throw
  // "invalid input syntax for type uuid", breaking org resolution / agents /
  // chat in the local edition. Enforce the format so that can't recur.
  assert.match(
    LOCAL_USER.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "LOCAL_USER.id must be a valid (hex-only) UUID",
  );
});

test("fs blob adapter: round-trips + is traversal-proof", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-blob-"));
  process.env.BLOB_DIR = dir;
  try {
    const { putBlobFs, getBlobFs } = await import("../lib/storage/blob-fs.ts");
    await putBlobFs("ab/cd/hash123", Buffer.from("hello vault"));
    assert.equal((await getBlobFs("ab/cd/hash123")).toString(), "hello vault");
    await assert.rejects(getBlobFs("nope/missing"), /No object/);
    // A traversal key is sanitized to stay under the root (never escapes).
    await putBlobFs("../../etc/evil", Buffer.from("x"));
    const escaped = await fs.readFile("/etc/evil").then(() => true, () => false);
    assert.equal(escaped, false, "nothing was written outside the blob root");
  } finally {
    delete process.env.BLOB_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
