// Integration test for the local edition's embedded database
// (lib/local/embedded-db.mjs): boot pglite → build the schema via `prisma db
// push` over the socket → the index fixup → real vector + trigram queries.
// This is the whole zero-setup DB path. Slower than a unit test (it spawns
// prisma), so it's guarded — set DATAMODO_TEST_DB=1 to run it. Run with:
//   DATAMODO_TEST_DB=1 npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const RUN = process.env.DATAMODO_TEST_DB === "1";

test("embedded db: pglite + prisma db push + vector/trigram", { skip: !RUN }, async () => {
  const { startEmbeddedDb } = await import("../lib/local/embedded-db.mjs");
  const pg = (await import("pg")).default;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-edb-"));
  const appRoot = path.resolve(import.meta.dirname, "..");
  const port = 54355;
  const db = await startEmbeddedDb({ appRoot, dataDir, port });
  try {
    await db.ensureSchema("test-1");

    const c = new pg.Client({ connectionString: db.url });
    await c.connect();
    try {
      // The schema built (many tables) and the vector column is real.
      const t = await c.query("select count(*)::int n from information_schema.tables where table_schema='public'");
      assert.ok(t.rows[0].n > 15, `expected the full schema, got ${t.rows[0].n} tables`);
      const col = await c.query("select udt_name from information_schema.columns where table_name='entities' and column_name='embedding'");
      assert.equal(col.rows[0]?.udt_name, "vector");

      // The whole knowledge-layer pattern: org → entity with a 1536-d vector →
      // ANN + trigram. This is exactly what resolution/GraphRAG run.
      const vec = "[" + Array(1536).fill(0.1).join(",") + "]";
      const org = await c.query("insert into organizations(name, slug) values('Local','personal-local') returning id");
      const oid = org.rows[0].id;
      await c.query(
        "insert into entities(org_id, kind, canonical_label, normalized_key, embedding, embedding_model) values($1,'company','Acme Group','company:acme',$2::vector,'m')",
        [oid, vec],
      );
      const ann = await c.query("select canonical_label, (1-(embedding <=> $1::vector))::real sim from entities order by embedding <=> $1::vector limit 1", [vec]);
      assert.equal(ann.rows[0].canonical_label, "Acme Group");
      assert.ok(ann.rows[0].sim > 0.99, "identical vector → sim ~1");
      const trg = await c.query("select canonical_label from entities where canonical_label % 'acme grp'");
      assert.deepEqual(trg.rows.map((r) => r.canonical_label), ["Acme Group"], "trigram fuzzy match works");

      // Stored functions + triggers (prisma db push does NOT create these — they
      // live in neon/schema.sql and are installed separately). The app calls
      // these via raw SQL; a missing one throws "function … does not exist".
      const match = await c.query("select id, canonical_label, sim from public.knowledge_match_entities($1,'company','acme grp',5)", [oid]);
      assert.equal(match.rows[0]?.canonical_label, "Acme Group", "knowledge_match_entities resolves via trigram");
      await c.query("select public.dataset_accepted_counts($1)", [oid]); // must not throw ("function does not exist")
      const trgCount = await c.query("select count(*)::int n from pg_trigger where tgname like '%refcount%' or tgname like '%touch_updated_at%'");
      assert.ok(trgCount.rows[0].n >= 6, `expected the refcount/updated_at triggers, got ${trgCount.rows[0].n}`);

      // ensureSchema is idempotent — a second call re-applies functions cleanly.
      await db.ensureSchema("test-1");
    } finally {
      await c.end();
    }
  } finally {
    await db.stop();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("embedded db: configurable embedding dimension (local model)", { skip: !RUN }, async () => {
  const { startEmbeddedDb } = await import("../lib/local/embedded-db.mjs");
  const pg = (await import("pg")).default;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-edb-dim-"));
  const appRoot = path.resolve(import.meta.dirname, "..");
  const port = 54356;
  const db = await startEmbeddedDb({ appRoot, dataDir, port });
  try {
    // A local model (e.g. Ollama nomic-embed-text) is 768-dim — the column must
    // be built to match or every vector is rejected at store time.
    await db.ensureSchema("test-dim", { embeddingDim: 768 });

    const c = new pg.Client({ connectionString: db.url });
    await c.connect();
    try {
      // pgvector stores the column dimension directly in atttypmod.
      const dim = await c.query(
        "select a.atttypmod d from pg_attribute a join pg_class rel on rel.oid=a.attrelid where rel.relname='entities' and a.attname='embedding'",
      );
      assert.equal(dim.rows[0].d, 768, "entities.embedding is vector(768)");

      // A 768-d vector stores + round-trips through ANN (would fail on vector(1536)).
      const vec = "[" + Array(768).fill(0.2).join(",") + "]";
      const org = await c.query("insert into organizations(name, slug) values('Local','personal-local') returning id");
      await c.query(
        "insert into entities(org_id, kind, canonical_label, normalized_key, embedding, embedding_model) values($1,'company','Acme','company:acme',$2::vector,'nomic')",
        [org.rows[0].id, vec],
      );
      const ann = await c.query("select (1-(embedding <=> $1::vector))::real sim from entities order by embedding <=> $1::vector limit 1", [vec]);
      assert.ok(ann.rows[0].sim > 0.99, "768-d identical vector → sim ~1");
    } finally {
      await c.end();
    }
  } finally {
    await db.stop();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
