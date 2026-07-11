import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { embedTexts, embeddingsConfigured, embeddingsModel, toVectorLiteral } from "@/lib/llm/embeddings";
import { embedTextForEntity } from "@/lib/datamodo/knowledge";

// RE-EMBED — the other half of the embedding_model stamp: vectors from
// different models are not comparable, so after changing EMBEDDINGS_MODEL
// (or turning embeddings on for the first time), hit this until `remaining`
// is 0. Each call re-embeds one batch of entities and doc chunks whose stamp
// differs from the current space (or that have no vector at all), from the
// same canonical texts ingest uses. Stale rows are harmless in the meantime —
// ANN recall filters to the current stamp, so they just degrade to trigram.
export const runtime = "nodejs";
export const maxDuration = 60;

// Same contract as extract-tick: `Authorization: Bearer <CRON_SECRET>`.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface EntityRow { id: string; kind: string; canonical_label: string; natural_keys: Record<string, string> | null }
interface ChunkRow { id: string; text: string }

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!embeddingsConfigured()) {
    return NextResponse.json({ error: "embeddings are not configured (no key)" }, { status: 503 });
  }

  const url = new URL(req.url);
  const batch = Math.min(Math.max(Number(url.searchParams.get("batch")) || 100, 1), 500);
  const space = embeddingsModel();

  // Entities first (they power resolution), then chunks with what's left.
  const entities = await prisma.$queryRaw<EntityRow[]>`
    SELECT id, kind, canonical_label, natural_keys
      FROM entities
     WHERE merged_into IS NULL
       AND (embedding IS NULL OR embedding_model IS DISTINCT FROM ${space})
     LIMIT ${batch}`;
  let entitiesEmbedded = 0;
  if (entities.length) {
    const vectors = await embedTexts(
      entities.map((e) => embedTextForEntity(e.kind, e.canonical_label, e.natural_keys)),
    );
    if (!vectors) return NextResponse.json({ error: "embedding call failed — try again" }, { status: 502 });
    for (let i = 0; i < entities.length; i++) {
      await prisma.$executeRaw`
        UPDATE entities SET embedding = ${toVectorLiteral(vectors[i])}::vector,
                            embedding_model = ${space}
         WHERE id = ${entities[i].id}::uuid`;
      entitiesEmbedded++;
    }
  }

  const chunkBudget = batch - entities.length;
  let chunksEmbedded = 0;
  if (chunkBudget > 0) {
    const chunks = await prisma.$queryRaw<ChunkRow[]>`
      SELECT id, text FROM doc_chunks
       WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM ${space}
       LIMIT ${chunkBudget}`;
    if (chunks.length) {
      const vectors = await embedTexts(chunks.map((c) => c.text));
      if (vectors) {
        for (let i = 0; i < chunks.length; i++) {
          await prisma.$executeRaw`
            UPDATE doc_chunks SET embedding = ${toVectorLiteral(vectors[i])}::vector,
                                  embedding_model = ${space}
             WHERE id = ${chunks[i].id}::uuid`;
          chunksEmbedded++;
        }
      }
    }
  }

  const [entLeft, chunkLeft] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM entities
       WHERE merged_into IS NULL
         AND (embedding IS NULL OR embedding_model IS DISTINCT FROM ${space})`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM doc_chunks
       WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM ${space}`,
  ]);

  return NextResponse.json({
    space,
    entitiesEmbedded,
    chunksEmbedded,
    remaining: Number(entLeft[0]?.n ?? 0) + Number(chunkLeft[0]?.n ?? 0),
  });
}
