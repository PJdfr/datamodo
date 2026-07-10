import { prisma } from "@/lib/prisma";
import { embedTexts, toVectorLiteral } from "@/lib/llm/embeddings";
import type { DocChunk } from "./document-extraction";

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
        UPDATE doc_chunks SET embedding = ${toVectorLiteral(vectors[c.seq])}::vector
         WHERE org_id = ${orgId}::uuid AND entity_id = ${entityId}::uuid AND seq = ${c.seq}`
        .catch((e) => console.error("[chunks] embedding store failed", e));
    }
  }
  return chunks.length;
}

export interface ChunkHit {
  entityId: string;
  docLabel: string;
  page: number | null;
  text: string;
  score: number;
}

/** Keyword search over document passages (same distinct-terms ranking as the
 *  table search). Semantic ANN over chunk embeddings can slot in here later
 *  without changing the shape. */
export async function searchChunks(
  orgId: string,
  terms: string[],
  opts: { limit?: number; scan?: number } = {},
): Promise<ChunkHit[]> {
  const limit = opts.limit ?? 6;
  const scan = opts.scan ?? 300;
  if (terms.length === 0) return [];

  const rows = await prisma.doc_chunks.findMany({
    where: {
      org_id: orgId,
      OR: terms.map((t) => ({ text: { contains: t, mode: "insensitive" as const } })),
    },
    select: { entity_id: true, page: true, text: true, entities: { select: { canonical_label: true } } },
    take: scan,
  });

  const hits: ChunkHit[] = [];
  for (const r of rows as { entity_id: string; page: number | null; text: string; entities: { canonical_label: string } }[]) {
    const hay = r.text.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score++;
    if (score > 0) {
      hits.push({
        entityId: r.entity_id,
        docLabel: r.entities.canonical_label,
        page: r.page,
        text: r.text.length > 400 ? r.text.slice(0, 400) + "…" : r.text,
        score,
      });
    }
  }
  // Best chunk per document first, then overall score.
  hits.sort((a, b) => b.score - a.score);
  const perDoc = new Map<string, number>();
  return hits
    .filter((h) => {
      const n = perDoc.get(h.entityId) ?? 0;
      perDoc.set(h.entityId, n + 1);
      return n < 2; // at most 2 passages per document
    })
    .slice(0, limit);
}
