// GRAPH-FIRST RETRIEVAL (GraphRAG) — grounded answers start from `facts`,
// vectors are the fallback (ROADMAP 2026-07-14). Keyword search only surfaces
// entities the query literally names; this module (1) LINKS the query to
// entities by label/natural-key ("the Acme deal" → the Acme node; the ANN leg
// in knowledge.ts adds paraphrases), then (2) TRAVERSES the fact graph around
// those seeds — the seeds' own facts plus their neighbors' — so multi-hop
// questions ("who works at the company that issued INV-9?") find their
// evidence even when no keyword matches it. The result rides the existing
// KnowledgeHit shape straight into buildAnswerContext; doc_chunk retrieval
// gets SCOPED to the linked neighborhood (chunks.ts). Works over the
// current-claims views listKnowledge already builds (valid_to IS NULL — the
// bitemporal filter happened upstream). Pure module — unit-tested; adjacency
// is the ONE shared rule (buildAdjacency).

import type { KnowledgeEntityView } from "./types";
import type { KnowledgeHit, KnowledgeHitFact } from "./search";
import { buildAdjacency } from "./explorer.ts";

/** How strongly the query names an entity (0 = it doesn't). */
function linkScore(e: KnowledgeEntityView, terms: string[]): number {
  if (terms.length === 0) return 0;
  const labelTokens = e.label.toLowerCase().match(/[a-z0-9@._$-]+/g) ?? [];
  const keyValues = Object.values(e.naturalKeys ?? {}).map((v) => v.toLowerCase());
  let matched = 0;
  for (const tok of labelTokens) {
    if (terms.some((t) => tok === t || (t.length >= 3 && tok.startsWith(t)) || (tok.length >= 3 && t.startsWith(tok)))) matched++;
  }
  // A natural key the query contains (an email, an invoice number) is as
  // strong as naming the label outright.
  const keyHit = keyValues.some((v) => v && terms.some((t) => v === t || v.includes(t) && t.length >= 4));
  if (matched === 0 && !keyHit) return 0;
  const coverage = labelTokens.length ? matched / labelTokens.length : 0;
  return coverage + (keyHit ? 1 : 0);
}

/**
 * Step 1 — entity-link the query BY TEXT: entities whose label/natural keys
 * the query actually names, best coverage first (ties: better-connected
 * wins). Deliberately stricter than keyword search (which also matches fact
 * values): a seed anchors a traversal, so it must BE named, not just
 * mentioned in some fact. The semantic leg (annLinkEntities) adds paraphrase
 * seeds the text can't catch.
 */
export function linkQueryEntities(
  entities: KnowledgeEntityView[],
  terms: string[],
  opts: { limit?: number } = {},
): string[] {
  const limit = opts.limit ?? 5;
  return entities
    .map((e) => ({ e, s: linkScore(e, terms) }))
    .filter((x) => x.s >= 0.5) // at least half the label named (or a key hit)
    .sort((a, b) => b.s - a.s || b.e.edges - a.e.edges || a.e.label.localeCompare(b.e.label))
    .slice(0, limit)
    .map((x) => x.e.id);
}

export interface GraphEvidence {
  /** Subject-grouped evidence, seeds first — KnowledgeHit-shaped so it rides
   *  the existing answer context/citation machinery unchanged. */
  hits: KnowledgeHit[];
  /** Seeds + their neighborhood — the scope for chunk retrieval. */
  scopeIds: string[];
}

const SEED_SCORE = 10; // above any keyword score (distinct-term counts)
const NEIGHBOR_SCORE = 4;

/**
 * Step 2 — traverse the fact graph: the seeds' own facts plus their best
 * neighbors' facts (neighbors ranked by how many facts tie them to the
 * seeds). A neighbor's facts reach 2 hops of information — its edges name
 * hop-2 entities by label. Facts that touch a seed are flagged `matched`.
 */
export function expandFromSeeds(
  entities: KnowledgeEntityView[],
  seedIds: string[],
  opts: { maxNeighbors?: number; maxFactsPerEntity?: number } = {},
): GraphEvidence {
  const maxNeighbors = opts.maxNeighbors ?? 8;
  const maxFacts = opts.maxFactsPerEntity ?? 12;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const seeds = seedIds.filter((id) => byId.has(id));
  if (seeds.length === 0) return { hits: [], scopeIds: [] };
  const seedSet = new Set(seeds);

  // Neighbors by seed-tie strength (fact count against any seed) — the ONE
  // adjacency rule, weights included.
  const adjacency = buildAdjacency(entities);
  const tie = new Map<string, number>();
  for (const id of seeds) {
    for (const [nbr, w] of adjacency.get(id) ?? []) {
      if (!seedSet.has(nbr)) tie.set(nbr, (tie.get(nbr) ?? 0) + w);
    }
  }
  const neighbors = [...tie.entries()]
    .sort((a, b) => b[1] - a[1] || (byId.get(b[0])?.edges ?? 0) - (byId.get(a[0])?.edges ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, maxNeighbors)
    .map(([id]) => id);

  const toHit = (id: string, score: number): KnowledgeHit => {
    const e = byId.get(id)!;
    const facts: (KnowledgeHitFact & { _seed: boolean; _conf: number })[] = e.facts.map((f) => ({
      predicate: f.predicate,
      value: f.value,
      ref: f.ref,
      matched: Boolean(f.ref && f.refId && seedSet.has(f.refId)),
      _seed: Boolean(f.ref && f.refId && seedSet.has(f.refId)),
      _conf: f.confidence,
    }));
    // Seed-touching facts first, then confident ones — then drop the sort keys.
    facts.sort((a, b) => Number(b._seed) - Number(a._seed) || b._conf - a._conf);
    return {
      id: e.id,
      label: e.label,
      kind: e.kind,
      facts: facts.slice(0, maxFacts).map(({ predicate, value, ref, matched }) => ({ predicate, value, ref, matched })),
      score,
    };
  };

  return {
    hits: [...seeds.map((id) => toHit(id, SEED_SCORE)), ...neighbors.map((id) => toHit(id, NEIGHBOR_SCORE))],
    scopeIds: [...seeds, ...neighbors],
  };
}

/**
 * Merge graph evidence with the keyword hits for the answer context: dedupe
 * by entity (higher score wins — a seed beats its keyword twin, and the
 * graph version carries the traversal's fact ordering), rank by score then
 * label, cap. Keyword-only hits survive — the graph EXTENDS the evidence.
 */
export function mergeKnowledgeHits(keyword: KnowledgeHit[], graph: KnowledgeHit[], limit = 8): KnowledgeHit[] {
  const byId = new Map<string, KnowledgeHit>();
  for (const h of keyword) byId.set(h.id, h);
  for (const h of graph) {
    const seen = byId.get(h.id);
    if (!seen || h.score > seen.score) byId.set(h.id, h);
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}
