// CONSOLIDATION pure core (GRAPH_PIPELINE.md P1) — the deterministic half of
// the background homeostasis pass: which candidate pairs are worth
// adjudicating, which entity survives a merge, and which strays qualify as
// prunable orphans. No Prisma, no LLM, no env — unit-tested in
// tests/consolidate.test.ts; the DB/LLM orchestration lives in consolidate.ts.

/** A light projection of an entity, enough for every decision here. */
export interface ConsolidationEntity {
  id: string;
  kind: string;
  label: string;
  naturalKeys: Record<string, string>;
  support: number;
  /** Facts touching the entity (as subject or object). */
  edgeCount: number;
  bodyMd: string | null;
  createdAt: Date;
  /** Last time retrieval surfaced this entity (answer citation, graph seed,
   *  dossier download). Null = never, or predates the usage column. */
  lastUsedAt?: Date | null;
}

/** A candidate duplicate pair surfaced by trigram or ANN blocking. */
export interface CandidatePair {
  aId: string;
  bId: string;
  /** Blocking similarity 0..1 (trigram or cosine — recall only, never truth). */
  sim: number;
}

/** Order-independent identity for a pair — dedup + "already reviewed" checks. */
export function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

/** Two entities whose STRONG identifiers disagree are different real-world
 *  things, whatever their labels say (two people can both be "Alex" — they
 *  cannot both be alex@a.com and alex@b.com). Shared keys must match; a key
 *  present on only one side is not a conflict. */
export function naturalKeysConflict(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  for (const [k, va] of Object.entries(a)) {
    const vb = b[k];
    if (va && vb && va.trim().toLowerCase() !== vb.trim().toLowerCase()) return true;
  }
  return false;
}

/** The merge keeps the better-established node: more edges, then more
 *  corroboration, then the older one (stable ids beat fresh ones). */
export function pickWinner(a: ConsolidationEntity, b: ConsolidationEntity): {
  winner: ConsolidationEntity;
  loser: ConsolidationEntity;
} {
  const better =
    a.edgeCount !== b.edgeCount
      ? a.edgeCount > b.edgeCount
      : a.support !== b.support
        ? a.support > b.support
        : a.createdAt.getTime() <= b.createdAt.getTime();
  return better ? { winner: a, loser: b } : { winner: b, loser: a };
}

/** Union of natural keys after a merge — the winner's values always win; the
 *  loser only contributes keys the winner lacks (identity accretes, never
 *  mutates). */
export function mergedNaturalKeys(
  winner: Record<string, string>,
  loser: Record<string, string>,
): Record<string, string> {
  return { ...loser, ...winner };
}

/** Dedup candidate pairs (keep the highest blocking sim per pair) and drop
 *  pairs already decided (any prior entity_merge review, either direction)
 *  or structurally impossible (conflicting strong identifiers). */
export function filterCandidatePairs(
  pairs: CandidatePair[],
  reviewedPairKeys: Set<string>,
  entityById: Map<string, Pick<ConsolidationEntity, "naturalKeys">>,
): CandidatePair[] {
  const best = new Map<string, CandidatePair>();
  for (const p of pairs) {
    if (p.aId === p.bId) continue;
    const key = pairKey(p.aId, p.bId);
    if (reviewedPairKeys.has(key)) continue;
    const a = entityById.get(p.aId);
    const b = entityById.get(p.bId);
    if (!a || !b) continue;
    if (naturalKeysConflict(a.naturalKeys, b.naturalKeys)) continue;
    const prev = best.get(key);
    if (!prev || p.sim > prev.sim) best.set(key, p);
  }
  return [...best.values()].sort((x, y) => y.sim - x.sim);
}

// Orphan policy: a node nobody references, that corroborated nothing and has
// no page of its own, is graph noise once it has had time to earn a link.
// Concepts get a shorter grace period — topic sprawl is the known failure
// mode. Thick-node kinds are never orphans: their value IS the body/blob.
const ORPHAN_AFTER_DAYS = 30;
const CONCEPT_ORPHAN_AFTER_DAYS = 7;
const NEVER_PRUNE_KINDS = new Set(["document", "note"]);

export function orphanEligible(e: ConsolidationEntity, now: Date): boolean {
  if (NEVER_PRUNE_KINDS.has(e.kind)) return false;
  if (e.edgeCount > 0 || e.support > 1 || e.bodyMd) return false;
  const window = e.kind === "concept" ? CONCEPT_ORPHAN_AFTER_DAYS : ORPHAN_AFTER_DAYS;
  // Usage-weighted retention (§10b): an entity retrieval recently surfaced is
  // in use, however unlinked it looks — reads protect what writes never did.
  if (e.lastUsedAt && (now.getTime() - e.lastUsedAt.getTime()) / 86_400_000 <= window) return false;
  const days = (now.getTime() - e.createdAt.getTime()) / 86_400_000;
  return days > window;
}

/** What one consolidation tick did to one org — the route's observability. */
export interface ConsolidationStats {
  embeddedBackfilled: number;
  pairsConsidered: number;
  adjudicated: number;
  merged: number;
  proposed: number;
  /** Adjudicated below the propose bar — recorded so the pair never re-asks. */
  dismissed: number;
  orphansFlagged: number;
  /** Hot off-template predicates proposed as template fields (P2 gate). */
  fieldsProposed: number;
}

export function emptyStats(): ConsolidationStats {
  return {
    embeddedBackfilled: 0,
    pairsConsidered: 0,
    adjudicated: 0,
    merged: 0,
    proposed: 0,
    dismissed: 0,
    orphansFlagged: 0,
    fieldsProposed: 0,
  };
}
