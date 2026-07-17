import { prisma } from "@/lib/prisma";
import type { LlmProvider } from "@/lib/llm";
import { embedTexts, embeddingsModel, toVectorLiteral } from "@/lib/llm/embeddings";
import {
  adjudicateMatch,
  createMergeReview,
  embedTextForEntity,
  ensureTemplateSlots,
  mergeEntities,
  topFactsForEntities,
  AUTO_MERGE,
  PROPOSE,
} from "./knowledge";
import {
  emptyStats,
  filterCandidatePairs,
  orphanEligible,
  pairKey,
  pickWinner,
  type CandidatePair,
  type ConsolidationEntity,
  type ConsolidationStats,
} from "./consolidate-core";

// BACKGROUND CONSOLIDATION (GRAPH_PIPELINE.md P1) — the graph's homeostasis
// pass. The write path dedups what it can SEE at write time; this job
// re-examines the whole org on a slow cadence and fixes the drift that
// accumulates anyway: near-duplicate entities that arrived under different
// labels (or before embeddings existed), unlinked strays nobody references,
// and entities missing a vector. Everything lands through the SAME primitives
// as the hot path (adjudicateMatch, mergeEntities, knowledge_reviews) so the
// audit trail is identical: auto-merges are logged as accepted reviews,
// uncertain pairs become pending proposals, and orphans are only ever
// FLAGGED for the user — this job never silently deletes anything.

// Per-tick budgets: consolidation is allowed to be slow (it runs forever);
// what it must never be is expensive or disruptive in one burst.
const MAX_ADJUDICATIONS_PER_ORG = Number(process.env.CONSOLIDATE_ADJUDICATIONS ?? 12);
const MAX_EMBED_BACKFILL_PER_ORG = Number(process.env.CONSOLIDATE_EMBED_BATCH ?? 50);
const MAX_PAIRS_PER_ORG = 40;
// Blocking recall floors (recall only — resolution still goes through
// adjudication; see knowledge.ts on why cosine closeness is never trusted).
const TRGM_CANDIDATE = 0.55;
const ANN_CANDIDATE = 0.85;
// Without an LLM (no key / BYOK cap reached) we still PROPOSE clearly-similar
// pairs for the user to decide — but never auto-merge on surface text alone.
const PROPOSE_WITHOUT_LLM = 0.75;
// The freshest slice of the org we scan for ANN twins each tick.
const ANN_SCAN_ENTITIES = 300;

interface EntityRow {
  id: string;
  kind: string;
  canonical_label: string;
  natural_keys: unknown;
  support: number;
  body_md: string | null;
  created_at: Date;
  owner_user_id: string | null;
}

/** Load the org's live entities + per-entity edge counts in two queries. */
async function loadEntities(orgId: string): Promise<Map<string, ConsolidationEntity & { ownerUserId: string | null }>> {
  const [ents, edges] = await Promise.all([
    prisma.entities.findMany({
      where: { org_id: orgId, merged_into: null },
      select: {
        id: true,
        kind: true,
        canonical_label: true,
        natural_keys: true,
        support: true,
        body_md: true,
        created_at: true,
        owner_user_id: true,
      },
    }) as Promise<EntityRow[]>,
    // last_used_at rides via to_jsonb so a cloud DB that hasn't applied
    // migration 20260716210000 yet reads NULL instead of erroring.
    // Null-filled TEMPLATE SLOTS are not links — only facts with a value (or
    // an edge) count, so placeholder rows can't shield a stray from the
    // orphan pass.
    prisma.$queryRaw<{ id: string; edges: bigint; last_used: string | null }[]>`
      SELECT e.id, count(f.id) AS edges, to_jsonb(e) ->> 'last_used_at' AS last_used
        FROM entities e
        LEFT JOIN facts f
          ON f.org_id = e.org_id
         AND (f.subject_entity_id = e.id OR f.object_entity_id = e.id)
         AND (f.object_entity_id IS NOT NULL OR f.value_text IS NOT NULL
              OR f.value_num IS NOT NULL OR f.value_date IS NOT NULL)
       WHERE e.org_id = ${orgId}::uuid AND e.merged_into IS NULL
       GROUP BY e.id`,
  ]);
  const edgeCount = new Map(edges.map((r) => [r.id, Number(r.edges)]));
  const lastUsed = new Map(edges.map((r) => [r.id, r.last_used ? new Date(r.last_used) : null]));
  const out = new Map<string, ConsolidationEntity & { ownerUserId: string | null }>();
  for (const e of ents) {
    out.set(e.id, {
      id: e.id,
      kind: e.kind,
      label: e.canonical_label,
      naturalKeys: (e.natural_keys as Record<string, string>) ?? {},
      support: e.support,
      edgeCount: edgeCount.get(e.id) ?? 0,
      bodyMd: e.body_md,
      createdAt: e.created_at,
      lastUsedAt: lastUsed.get(e.id) ?? null,
      ownerUserId: e.owner_user_id,
    });
  }
  return out;
}

/** Same-kind label twins by trigram similarity — the cheap recall leg. */
async function findLabelPairs(orgId: string): Promise<CandidatePair[]> {
  const rows = await prisma.$queryRaw<{ a_id: string; b_id: string; sim: number }[]>`
    SELECT a.id AS a_id, b.id AS b_id,
           similarity(a.canonical_label, b.canonical_label)::real AS sim
      FROM entities a
      JOIN entities b
        ON b.org_id = a.org_id AND b.kind = a.kind AND b.id > a.id
     WHERE a.org_id = ${orgId}::uuid
       AND a.merged_into IS NULL AND b.merged_into IS NULL
       AND similarity(a.canonical_label, b.canonical_label) >= ${TRGM_CANDIDATE}
     ORDER BY sim DESC
     LIMIT ${MAX_PAIRS_PER_ORG}`;
  return rows.map((r) => ({ aId: r.a_id, bId: r.b_id, sim: r.sim }));
}

/** Same-kind semantic twins by embedding proximity — catches what surface
 *  text can't (acronyms, translations, paraphrased labels). Scans the most
 *  recently touched slice; one HNSW lookup per scanned entity. */
async function findAnnPairs(orgId: string): Promise<CandidatePair[]> {
  try {
    const rows = await prisma.$queryRaw<{ a_id: string; b_id: string; sim: number }[]>`
      SELECT a.id AS a_id, n.id AS b_id, n.sim
        FROM (
          SELECT id, kind, embedding
            FROM entities
           WHERE org_id = ${orgId}::uuid AND merged_into IS NULL
             AND embedding IS NOT NULL AND embedding_model = ${embeddingsModel()}
           ORDER BY updated_at DESC
           LIMIT ${ANN_SCAN_ENTITIES}
        ) a
        CROSS JOIN LATERAL (
          SELECT b.id, (1 - (a.embedding <=> b.embedding))::real AS sim
            FROM entities b
           WHERE b.org_id = ${orgId}::uuid AND b.kind = a.kind AND b.id <> a.id
             AND b.merged_into IS NULL AND b.embedding IS NOT NULL
             AND b.embedding_model = ${embeddingsModel()}
           ORDER BY a.embedding <=> b.embedding
           LIMIT 1
        ) n
       WHERE n.sim >= ${ANN_CANDIDATE}
       LIMIT ${MAX_PAIRS_PER_ORG}`;
    return rows.map((r) => ({ aId: r.a_id, bId: r.b_id, sim: r.sim }));
  } catch (e) {
    console.error("[consolidate] ANN pair scan failed", e);
    return [];
  }
}

/** Every pair a human or the pipeline already ruled on, either direction, any
 *  status — decided is decided; consolidation never re-litigates. */
async function reviewedPairKeys(orgId: string): Promise<Set<string>> {
  const rows = await prisma.knowledge_reviews.findMany({
    where: { org_id: orgId, kind: "entity_merge", source_entity_id: { not: null } },
    select: { source_entity_id: true, target_entity_id: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    if (r.source_entity_id && r.target_entity_id) set.add(pairKey(r.source_entity_id, r.target_entity_id));
  }
  return set;
}

/** Entities the orphan pass already asked about (any status) — decline means
 *  never re-ask, so exclusion is by id across ALL orphan_prune reviews. */
async function orphanAskedIds(orgId: string): Promise<Set<string>> {
  const rows = await prisma.knowledge_reviews.findMany({
    where: { org_id: orgId, kind: "orphan_prune" },
    select: { detail: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    const ids = (r.detail as { entityIds?: string[] } | null)?.entityIds ?? [];
    for (const id of ids) set.add(id);
  }
  return set;
}

/** Re-embed entities with no vector or a stale embedding space. Fail-soft:
 *  no embeddings key → returns 0 and the rest of the pass still runs. */
async function backfillEmbeddings(
  orgId: string,
  entities: (ConsolidationEntity & { ownerUserId: string | null })[],
): Promise<number> {
  const stale = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM entities
     WHERE org_id = ${orgId}::uuid AND merged_into IS NULL
       AND (embedding IS NULL OR embedding_model IS DISTINCT FROM ${embeddingsModel()})
     ORDER BY updated_at DESC
     LIMIT ${MAX_EMBED_BACKFILL_PER_ORG}`;
  if (stale.length === 0) return 0;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const targets = stale.map((r) => byId.get(r.id)).filter(Boolean) as ConsolidationEntity[];
  if (targets.length === 0) return 0;
  const vectors = await embedTexts(targets.map((e) => embedTextForEntity(e.kind, e.label, e.naturalKeys)));
  if (!vectors) return 0;
  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    try {
      await prisma.$executeRaw`
        UPDATE entities SET embedding = ${toVectorLiteral(vectors[i])}::vector,
                            embedding_model = ${embeddingsModel()}
         WHERE id = ${targets[i].id}::uuid AND org_id = ${orgId}::uuid`;
      done++;
    } catch (e) {
      console.error(`[consolidate] embedding backfill failed for ${targets[i].id}`, e);
    }
  }
  return done;
}

/**
 * One consolidation pass over one org. Budget-capped and idempotent: every
 * adjudicated pair is recorded as a review (accepted / pending / rejected) so
 * the next tick never reconsiders it; a tick that dies mid-pass just leaves
 * fewer decisions recorded.
 */
export async function consolidateOrg(orgId: string, llm?: LlmProvider | null): Promise<ConsolidationStats> {
  const stats = emptyStats();
  const entities = await loadEntities(orgId);
  const entityList = [...entities.values()];
  if (entityList.length === 0) return stats;
  const ownerUserId = entityList.find((e) => e.ownerUserId)?.ownerUserId ?? null;

  // ① Embedding backfill first — it feeds the ANN leg of the same tick.
  stats.embeddedBackfilled = await backfillEmbeddings(orgId, entityList);

  // ② Merge sweep.
  const [labelPairs, annPairs, reviewed] = await Promise.all([
    findLabelPairs(orgId),
    findAnnPairs(orgId),
    reviewedPairKeys(orgId),
  ]);
  const pairs = filterCandidatePairs([...labelPairs, ...annPairs], reviewed, entities);
  stats.pairsConsidered = pairs.length;

  for (const pair of pairs.slice(0, MAX_ADJUDICATIONS_PER_ORG)) {
    const a = entities.get(pair.aId)!;
    const b = entities.get(pair.bId)!;
    // The less-established side plays the "newly parsed" role; the better one
    // is the canonical candidate — same shape as hot-path resolution.
    const { winner, loser } = pickWinner(a, b);

    let confidence: number;
    let reason: string;
    if (llm) {
      // Both sides live in the graph — judge with their facts, not labels
      // (user call 2026-07-16). Fail-soft: an empty map just means bare labels.
      const factCtx = await topFactsForEntities(orgId, [winner.id, loser.id]);
      const verdict = await adjudicateMatch(
        { localId: "x", kind: loser.kind, label: loser.label, naturalKeys: loser.naturalKeys },
        [{
          id: winner.id,
          canonical_label: winner.label,
          sim: pair.sim,
          naturalKeys: winner.naturalKeys,
          support: winner.support,
          facts: factCtx.get(winner.id) ?? [],
        }],
        llm,
        { subjectFacts: factCtx.get(loser.id) ?? [] },
      );
      stats.adjudicated++;
      confidence = verdict.matchId === winner.id ? verdict.confidence : 0;
      reason = verdict.reason || `blocking similarity ${pair.sim.toFixed(2)}`;
    } else {
      // No adjudicator available — propose only, never auto-merge on text.
      confidence = pair.sim >= PROPOSE_WITHOUT_LLM ? Math.min(pair.sim, AUTO_MERGE - 0.01) : 0;
      reason = `label similarity ${pair.sim.toFixed(2)} (no adjudicator available)`;
    }

    if (confidence >= AUTO_MERGE) {
      // Identity accretes: keys the winner lacks come along before the merge.
      const missing = Object.fromEntries(
        Object.entries(loser.naturalKeys).filter(([k]) => !winner.naturalKeys[k]),
      );
      if (Object.keys(missing).length) {
        await prisma.entities.update({
          where: { id: winner.id, org_id: orgId },
          data: { natural_keys: { ...loser.naturalKeys, ...winner.naturalKeys } },
        });
      }
      await mergeEntities(orgId, loser.id, winner.id);
      await createMergeReview(orgId, ownerUserId, {
        sourceId: loser.id,
        targetId: winner.id,
        confidence,
        status: "accepted",
        detail: { auto: true, consolidation: true, parsedLabel: loser.label, reason },
      });
      stats.merged++;
    } else if (confidence >= PROPOSE) {
      await createMergeReview(orgId, ownerUserId, {
        sourceId: loser.id,
        targetId: winner.id,
        confidence,
        status: "pending",
        detail: { consolidation: true, parsedLabel: loser.label, reason },
      });
      stats.proposed++;
    } else {
      // Recorded as auto-rejected so the pair is settled and never re-asked.
      await createMergeReview(orgId, ownerUserId, {
        sourceId: loser.id,
        targetId: winner.id,
        confidence,
        status: "rejected",
        detail: { auto: true, consolidation: true, parsedLabel: loser.label, reason },
      });
      stats.dismissed++;
    }
  }

  // ②b TEMPLATE BLOCK backfill: nodes created before their template existed
  // (or before the 2026-07-16 decision) gain their null slots here — the
  // ingest-time fill only touches entities an extraction mentions. Budget-
  // capped; idempotent (ensureTemplateSlots skips existing slots).
  try {
    const { listKinds } = await import("./kinds");
    const kinds = await listKinds(orgId, ownerUserId);
    const templated = new Set(kinds.filter((k) => k.fields.length > 0).map((k) => k.kind));
    const nodes = entityList.filter((e) => templated.has(e.kind)).slice(0, 200);
    stats.slotsBackfilled = await ensureTemplateSlots(orgId, ownerUserId, nodes, kinds);
  } catch (e) {
    console.error("[consolidate] template-slot backfill failed", e);
  }

  // ③ (P2 growth gate) Hot off-template predicates → field proposals. Pure
  // decision in ontology-health.ts; kind+predicate pairs any prior
  // field_proposal ruled on (any status) are never re-asked. Best-effort.
  try {
    const [{ loadHealthFacts }, { listKinds }, { proposeFieldAdditions }] = await Promise.all([
      import("./analytics"),
      import("./kinds"),
      import("./ontology-health"),
    ]);
    const [healthFacts, kinds, prior] = await Promise.all([
      loadHealthFacts(orgId),
      listKinds(orgId, ownerUserId),
      prisma.knowledge_reviews.findMany({
        where: { org_id: orgId, kind: "field_proposal" },
        select: { detail: true },
      }),
    ]);
    const askedFields = new Set(
      prior.map((r) => {
        const d = r.detail as { kind?: string; predicate?: string } | null;
        return `${d?.kind ?? ""}::${d?.predicate ?? ""}`;
      }),
    );
    const proposals = proposeFieldAdditions(healthFacts, kinds).filter(
      (p) => !askedFields.has(`${p.kind}::${p.predicate}`),
    );
    for (const p of proposals) {
      await prisma.knowledge_reviews.create({
        data: {
          org_id: orgId,
          owner_user_id: ownerUserId,
          kind: "field_proposal",
          status: "pending",
          confidence: null,
          impact: p.count,
          detail: {
            kind: p.kind,
            predicate: p.predicate,
            count: p.count,
            valueType: p.valueType,
            asRelation: p.asRelation,
            ...(p.unit ? { unit: p.unit } : {}),
            ...(p.aliasOf ? { aliasOf: p.aliasOf } : {}),
          },
        },
      });
      stats.fieldsProposed++;
    }
  } catch (e) {
    console.error("[consolidate] field-proposal pass failed", e);
  }

  // ④ Orphan pass — flag, never delete. One batched review per tick.
  const asked = await orphanAskedIds(orgId);
  const now = new Date();
  const orphans = entityList.filter((e) => !asked.has(e.id) && orphanEligible(e, now));
  if (orphans.length > 0) {
    await prisma.knowledge_reviews.create({
      data: {
        org_id: orgId,
        owner_user_id: ownerUserId,
        kind: "orphan_prune",
        status: "pending",
        confidence: null,
        impact: orphans.length,
        detail: {
          entityIds: orphans.map((o) => o.id),
          entities: orphans.slice(0, 12).map((o) => ({ id: o.id, label: o.label, kind: o.kind })),
        },
      },
    });
    stats.orphansFlagged = orphans.length;
  }

  // ⑤ Adaptive routing (GRAPH_PIPELINE.md "Adaptive classifiers (1)"): sweep
  // uncorrected auto-routed items into implicit accepts, embed the accepted
  // feedback heads (one batch), fold per-agent centroids + term-weight
  // corrections. Fail-soft: pre-migration DB / no embeddings key → dormant.
  try {
    const { learnRoutingProfiles } = await import("./routing");
    const routing = await learnRoutingProfiles(orgId);
    stats.routingEventsFolded = routing.eventsFolded;
    stats.routingCentroidsUpdated = routing.centroidsUpdated;
  } catch (e) {
    console.error("[consolidate] routing learning pass failed", e);
  }

  return stats;
}

/** Orgs that have anything to consolidate, most recently active first. */
export async function orgsWithEntities(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ org_id: string }[]>`
    SELECT org_id, max(updated_at) AS last
      FROM entities
     WHERE merged_into IS NULL
     GROUP BY org_id
     ORDER BY last DESC
     LIMIT ${limit}`;
  return rows.map((r) => r.org_id);
}
