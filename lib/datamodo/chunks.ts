import { prisma } from "@/lib/prisma";
import { embedTexts, embeddingsConfigured, embeddingsModel, toVectorLiteral } from "@/lib/llm/embeddings";
import type { DocChunk } from "./document-extraction";
import { mergePassages, type ChunkHit, type PassageCandidate } from "./passage-rank";

export type { ChunkHit } from "./passage-rank";

// Evidence layer, DB side: persist a document's chunks (with best-effort
// embeddings) and search them. Chunks are what let "ask anything" answer from
// INSIDE documents with page-level citations, instead of only from the facts
// extraction chose to keep.

/** Replace a document entity's chunks (idempotent — a re-forwarded file
 *  rewrites the same evidence, never duplicates it). */
export async function storeDocChunks(
  orgId: string,
  entityId: string,
  itemId: string | null,
  chunks: DocChunk[],
): Promise<number> {
  await prisma.doc_chunks.deleteMany({ where: { org_id: orgId, entity_id: entityId } });
  if (chunks.length === 0) return 0;

  await prisma.doc_chunks.createMany({
    data: chunks.map((c) => ({
      org_id: orgId,
      entity_id: entityId,
      item_id: itemId,
      seq: c.seq,
      page: c.page,
      text: c.text,
    })),
  });

  // Embeddings are best-effort garnish on top of keyword search — one batch
  // call, attached raw (vector is Unsupported in Prisma), skipped silently
  // when no embeddings key is configured.
  const vectors = await embedTexts(chunks.map((c) => c.text));
  if (vectors) {
    for (const c of chunks) {
      await prisma.$executeRaw`
        UPDATE doc_chunks SET embedding = ${toVectorLiteral(vectors[c.seq])}::vector,
                              embedding_model = ${embeddingsModel()}
         WHERE org_id = ${orgId}::uuid AND entity_id = ${entityId}::uuid AND seq = ${c.seq}`
        .catch((e) => console.error("[chunks] embedding store failed", e));
    }
  }
  return chunks.length;
}

/** Similarity floor for semantic backfill — below this, "nearest" chunks are
 *  just noise the merge would drag into answers. */
const ANN_MIN_SIM = 0.2;

/**
 * Search document passages: KEYWORD recall (same distinct-terms ranking as
 *  the table search) UNION semantic ANN recall over the chunk embeddings when
 *  `opts.query` is given and an embeddings key is configured (fail-soft — no
 *  key / no vectors / API error degrades to keyword-only, never throws).
 *  Semantic hits extend recall but rank below exact matches; passages found
 *  by both paths get boosted (rule in passage-rank.ts). ANN only compares
 *  vectors from the CURRENT embedding space (one space per deployment).
 */
export async function searchChunks(
  orgId: string,
  terms: string[],
  opts: { limit?: number; scan?: number; query?: string } = {},
): Promise<ChunkHit[]> {
  const limit = opts.limit ?? 6;
  const scan = opts.scan ?? 300;
  const query = opts.query?.trim();
  if (terms.length === 0 && !query) return [];

  const keywordLeg = async (): Promise<PassageCandidate[]> => {
    if (terms.length === 0) return [];
    const rows = await prisma.doc_chunks.findMany({
      where: {
        org_id: orgId,
        OR: terms.map((t) => ({ text: { contains: t, mode: "insensitive" as const } })),
      },
      select: { entity_id: true, seq: true, page: true, text: true, entities: { select: { canonical_label: true } } },
      take: scan,
    });
    const hits: PassageCandidate[] = [];
    for (const r of rows as { entity_id: string; seq: number; page: number | null; text: string; entities: { canonical_label: string } }[]) {
      const hay = r.text.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score++;
      if (score > 0) hits.push({ entityId: r.entity_id, seq: r.seq, docLabel: r.entities.canonical_label, page: r.page, text: r.text, score });
    }
    return hits;
  };

  const semanticLeg = async (): Promise<PassageCandidate[]> => {
    if (!query || !embeddingsConfigured()) return [];
    try {
      const vectors = await embedTexts([query]);
      if (!vectors) return [];
      const vec = toVectorLiteral(vectors[0]);
      const rows = await prisma.$queryRaw<{ entity_id: string; seq: number; page: number | null; text: string; canonical_label: string; sim: number }[]>`
        SELECT dc.entity_id, dc.seq, dc.page, dc.text, e.canonical_label,
               (1 - (dc.embedding <=> ${vec}::vector))::real AS sim
          FROM doc_chunks dc
          JOIN entities e ON e.id = dc.entity_id
         WHERE dc.org_id = ${orgId}::uuid
           AND dc.embedding IS NOT NULL
           AND dc.embedding_model = ${embeddingsModel()}
         ORDER BY dc.embedding <=> ${vec}::vector
         LIMIT ${limit * 3}`;
      return rows
        .filter((r) => r.sim >= ANN_MIN_SIM)
        .map((r) => ({ entityId: r.entity_id, seq: r.seq, docLabel: r.canonical_label, page: r.page, text: r.text, score: r.sim }));
    } catch (e) {
      console.error("[chunks] semantic search failed", e);
      return [];
    }
  };

  const [keyword, semantic] = await Promise.all([keywordLeg(), semanticLeg()]);
  return mergePassages(keyword, semantic, { limit });
}
