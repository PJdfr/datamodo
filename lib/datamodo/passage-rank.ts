// Passage ranking — the pure half of the evidence-layer search (chunks.ts is
// the DB shell that feeds it). Two recall paths meet here: KEYWORD hits
// (matched-term counts — precise, integer scores ≥ 1) and SEMANTIC hits (ANN
// cosine similarity — fuzzy, 0..1). The merge rule keeps keyword precision on
// top: a passage found by both gets its similarity added as a boost, a
// semantic-only passage scores below every keyword hit (< 1) — semantic recall
// EXTENDS the result set ("carry trade" finds "basis harvesting"), it never
// outranks an exact match. Pure module — unit-tested.

export interface ChunkHit {
  entityId: string;
  docLabel: string;
  page: number | null;
  text: string;
  score: number;
}

/** A candidate passage from either recall path, still carrying its chunk
 *  identity (`seq`) so the two paths can dedupe. */
export interface PassageCandidate extends ChunkHit {
  seq: number;
}

const SNIPPET = 400;
const snip = (t: string) => (t.length > SNIPPET ? t.slice(0, SNIPPET) + "…" : t);

/**
 * Merge keyword + semantic candidates into the final passage list:
 * dedupe by (entity, seq) — both-paths passages add their scores; rank by
 * score desc (deterministic tie-break by entity/seq); at most `perDoc`
 * passages per document; `limit` overall; snippets capped for transport.
 */
export function mergePassages(
  keyword: PassageCandidate[],
  semantic: PassageCandidate[],
  opts: { limit?: number; perDoc?: number } = {},
): ChunkHit[] {
  const limit = opts.limit ?? 6;
  const perDocCap = opts.perDoc ?? 2;

  const byId = new Map<string, PassageCandidate>();
  for (const k of keyword) byId.set(`${k.entityId}~${k.seq}`, { ...k });
  for (const s of semantic) {
    const key = `${s.entityId}~${s.seq}`;
    const seen = byId.get(key);
    if (seen) seen.score += s.score; // found by both → similarity boosts the keyword rank
    else byId.set(key, { ...s });
  }

  const ranked = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId) || a.seq - b.seq,
  );
  const perDoc = new Map<string, number>();
  const out: ChunkHit[] = [];
  for (const h of ranked) {
    const n = perDoc.get(h.entityId) ?? 0;
    if (n >= perDocCap) continue;
    perDoc.set(h.entityId, n + 1);
    out.push({ entityId: h.entityId, docLabel: h.docLabel, page: h.page, text: snip(h.text), score: h.score });
    if (out.length >= limit) break;
  }
  return out;
}
