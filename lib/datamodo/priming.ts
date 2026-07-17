import { prisma } from "@/lib/prisma";
import { embedTexts, embeddingsModel, toVectorLiteral } from "@/lib/llm/embeddings";
import { rankPrimedCandidates, type PrimedCandidate } from "./priming-core.ts";

// DB legs of relevance priming (see priming-core.ts for the rules): find the
// graph entities worth showing the extraction LLM for one message. Two legs,
// both fail-soft:
//   LEXICAL — labels literally present in the text (strongest evidence,
//   works with zero keys);
//   SEMANTIC — ANN over entity embeddings with ONE embedding of the raw
//   message (same current-space rule as every other ANN read).

const LEG_LIMIT = 12;
// Bound the embedding call: the head of a message identifies its subjects.
const EMBED_CHARS = 4000;

interface Row {
  kind: string;
  canonical_label: string;
  natural_keys: unknown;
  support: number;
  sim?: number;
}

function toCandidate(r: Row): PrimedCandidate {
  const keys = (r.natural_keys as Record<string, string>) ?? {};
  const hint = keys.email ?? keys.phone ?? keys.invoice_no ?? keys.id;
  return { kind: r.kind, label: r.canonical_label, hint, support: r.support, sim: r.sim };
}

/** Entities whose label literally appears in the text. Case-insensitive;
 *  3+ char labels only (short ones match everything). */
async function lexicalLeg(orgId: string, text: string): Promise<PrimedCandidate[]> {
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT kind, canonical_label, natural_keys, support
        FROM entities
       WHERE org_id = ${orgId}::uuid AND merged_into IS NULL
         AND length(canonical_label) >= 3
         AND strpos(lower(${text}), lower(canonical_label)) > 0
       ORDER BY support DESC
       LIMIT ${LEG_LIMIT}`;
    return rows.map(toCandidate);
  } catch (e) {
    console.error("[priming] lexical leg failed", e);
    return [];
  }
}

/** Entities semantically near the message. Recall only — the support floor
 *  and the prompt's never-force wording keep this from deciding identity.
 *  `vector` undefined = embed here; null = upstream already tried and failed
 *  (skip); an array = the shared per-message embedding (extract.ts computes
 *  ONE and routing + priming both ride it). */
async function semanticLeg(orgId: string, text: string, vector?: number[] | null): Promise<PrimedCandidate[]> {
  if (vector === null) return [];
  try {
    const vectors = vector ? [vector] : await embedTexts([text.slice(0, EMBED_CHARS)]);
    if (!vectors) return [];
    const vec = toVectorLiteral(vectors[0]);
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT kind, canonical_label, natural_keys, support,
             (1 - (embedding <=> ${vec}::vector))::real AS sim
        FROM entities
       WHERE org_id = ${orgId}::uuid AND merged_into IS NULL
         AND embedding IS NOT NULL AND embedding_model = ${embeddingsModel()}
       ORDER BY embedding <=> ${vec}::vector
       LIMIT ${LEG_LIMIT}`;
    return rows.map(toCandidate);
  } catch (e) {
    console.error("[priming] semantic leg failed", e);
    return [];
  }
}

/** The primed candidate list for one message — [] on any failure, so
 *  extraction always proceeds (with the support-ranked concept fallback).
 *  `vector`: optional pre-computed embedding of the text (see semanticLeg). */
export async function primeKnownEntities(
  orgId: string,
  text: string,
  vector?: number[] | null,
): Promise<PrimedCandidate[]> {
  if (!text.trim()) return [];
  const [lexical, semantic] = await Promise.all([lexicalLeg(orgId, text), semanticLeg(orgId, text, vector)]);
  return rankPrimedCandidates(lexical, semantic);
}
