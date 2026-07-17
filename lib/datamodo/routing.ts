import { prisma } from "@/lib/prisma";
import { embedTexts, embeddingsModel, toVectorLiteral } from "@/lib/llm/embeddings";
import {
  centroidBoost,
  foldCentroid,
  learnTermWeights,
  MIN_CENTROID_N,
  type RoutingEventSample,
} from "./routing-learn";

// ADAPTIVE ROUTING, DB side (pure rules in routing-learn.ts). Three legs:
//   · logRoutingEvent — the feedback log's single write chokepoint (chip
//     accept/dismiss, addressed sends, implicit accepts). Fail-soft: a
//     pre-migration DB just drops the event.
//   · agentRoutingBoosts — the router's read leg: one indexed SQL pass turns
//     the message embedding into per-agent score boosts via each agent's
//     learned centroid. Empty map without embeddings/migration/centroids.
//   · learnRoutingProfiles — the nightly consolidation pass: sweep items the
//     auto-router filed that nobody corrected into implicit accepts, embed
//     the unconsumed accepted heads (ONE batch), fold centroids + term
//     corrections onto the agents rows, stamp events consumed.

const TEXT_HEAD_CHARS = 1000;

export type RoutingEventSource = "chip_accept" | "chip_dismiss" | "addressed" | "implicit";

/** Feedback below this length is noise ("ok", "thanks") — never a label. */
export const MIN_FEEDBACK_CHARS = 12;

/** Log one routing feedback event. Best-effort by design — routing feedback
 *  is garnish on capture, never a reason for a send to fail. */
export async function logRoutingEvent(
  orgId: string,
  ev: {
    agentId: string;
    verdict: "accept" | "reject";
    source: RoutingEventSource;
    text: string;
    itemId?: string | null;
  },
): Promise<boolean> {
  const text = ev.text.trim();
  if (text.length < MIN_FEEDBACK_CHARS) return false;
  try {
    await prisma.routing_events.create({
      data: {
        org_id: orgId,
        agent_id: ev.agentId,
        item_id: ev.itemId ?? null,
        verdict: ev.verdict,
        source: ev.source,
        text_head: text.slice(0, TEXT_HEAD_CHARS),
      },
    });
    return true;
  } catch (e) {
    // Pre-migration DB (table missing) or a lost race — either way, silent.
    console.log(`[routing] feedback event dropped: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
    return false;
  }
}

/**
 * The router's centroid leg: per-agent additive score boosts for one message
 * embedding. Only centroids in the CURRENT embedding space and with enough
 * folded evidence (MIN_CENTROID_N) participate. Empty map on any failure.
 */
export async function agentRoutingBoosts(
  orgId: string,
  vector: number[] | null | undefined,
): Promise<Map<string, number>> {
  const boosts = new Map<string, number>();
  if (!vector || vector.length === 0) return boosts;
  try {
    const vec = toVectorLiteral(vector);
    const rows = await prisma.$queryRaw<{ id: string; sim: number }[]>`
      SELECT id, (1 - (routing_centroid <=> ${vec}::vector))::real AS sim
        FROM agents
       WHERE org_id = ${orgId}::uuid AND status = 'active'
         AND routing_centroid IS NOT NULL
         AND routing_centroid_model = ${embeddingsModel()}
         AND routing_centroid_n >= ${MIN_CENTROID_N}`;
    for (const r of rows) {
      const b = centroidBoost(r.sim);
      if (b > 0) boosts.set(r.id, b);
    }
  } catch {
    /* pre-migration DB / vector mishap — lexical routing only */
  }
  return boosts;
}

/** Learned term corrections for the org's agents ({} per agent pre-migration). */
export async function agentLearnedTerms(orgId: string): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  try {
    const rows = await prisma.$queryRaw<{ id: string; routing_terms: unknown }[]>`
      SELECT id, routing_terms FROM agents WHERE org_id = ${orgId}::uuid AND status = 'active'`;
    for (const r of rows) {
      const terms = (r.routing_terms ?? {}) as Record<string, number>;
      if (Object.keys(terms).length > 0) out.set(r.id, terms);
    }
  } catch {
    /* pre-migration DB — static profiles only */
  }
  return out;
}

// ---- the nightly learning pass (called from the consolidation tick) ----

/** Auto-routed items this old with no correction count as accepted. */
const IMPLICIT_ACCEPT_AFTER_HOURS = 24;
const MAX_IMPLICIT_PER_PASS = 100;
const MAX_EVENTS_PER_PASS = 200;

export interface RoutingLearnStats {
  implicitLogged: number;
  eventsFolded: number;
  centroidsUpdated: number;
}

/**
 * One org's routing-learning pass. Idempotent: implicit accepts dedupe on
 * item_id, folded events stamp consumed_at. Fail-soft: a pre-migration DB or
 * missing embeddings key leaves term learning / nothing to do.
 */
export async function learnRoutingProfiles(orgId: string): Promise<RoutingLearnStats> {
  const stats: RoutingLearnStats = { implicitLogged: 0, eventsFolded: 0, centroidsUpdated: 0 };
  try {
    // ① Implicit accepts: the auto-router filed it, a day passed, nobody
    // corrected it (there is no re-address flow yet, so "analyzed and left
    // alone" is the signal). One event per item, ever.
    stats.implicitLogged = Number(
      await prisma.$executeRaw`
        INSERT INTO routing_events (org_id, agent_id, item_id, verdict, source, text_head)
        SELECT i.org_id, a.id, i.id, 'accept', 'implicit',
               left(concat_ws(E'\\n', nullif(i.subject, ''), i.body_preview), ${TEXT_HEAD_CHARS})
          FROM items i
          JOIN agents a ON a.id = nullif(i.meta->>'routed_agent_id', '')::uuid
         WHERE i.org_id = ${orgId}::uuid
           AND i.status = 'analyzed'
           AND i.received_at < now() - make_interval(hours => ${IMPLICIT_ACCEPT_AFTER_HOURS})
           AND length(concat_ws(E'\\n', nullif(i.subject, ''), i.body_preview)) >= ${MIN_FEEDBACK_CHARS}
           AND NOT EXISTS (SELECT 1 FROM routing_events re WHERE re.item_id = i.id)
         LIMIT ${MAX_IMPLICIT_PER_PASS}`,
    );

    // ② Unconsumed feedback, oldest first, batch-capped.
    const events = await prisma.routing_events.findMany({
      where: { org_id: orgId, consumed_at: null },
      orderBy: { created_at: "asc" },
      take: MAX_EVENTS_PER_PASS,
      select: { id: true, agent_id: true, verdict: true, text_head: true },
    });
    if (events.length === 0) return stats;

    // ③ Embed the ACCEPTED heads in one batch (rejects only teach terms).
    // Fail-soft: no key → centroids stand still, term learning proceeds.
    const accepted = events.filter((e) => e.verdict === "accept");
    const vectors = accepted.length ? await embedTexts(accepted.map((e) => e.text_head)) : [];
    const vecByEvent = new Map<string, number[]>();
    if (vectors) accepted.forEach((e, i) => vectors[i] && vecByEvent.set(e.id, vectors[i]));

    // ④ Fold per agent: centroid from accepted vectors, term corrections
    // from every event's text.
    const byAgent = new Map<string, typeof events>();
    for (const e of events) {
      if (!byAgent.has(e.agent_id)) byAgent.set(e.agent_id, []);
      byAgent.get(e.agent_id)!.push(e);
    }
    for (const [agentId, agentEvents] of byAgent) {
      const agent = await prisma.$queryRaw<
        { routing_centroid: string | null; routing_centroid_model: string | null; routing_centroid_n: number; routing_terms: unknown }[]
      >`SELECT routing_centroid::text, routing_centroid_model, routing_centroid_n, routing_terms
          FROM agents WHERE id = ${agentId}::uuid AND org_id = ${orgId}::uuid`;
      if (agent.length === 0) continue;
      const row = agent[0];

      // A model change restarts the centroid — spaces never mix.
      const sameSpace = row.routing_centroid_model === embeddingsModel();
      const prev = sameSpace && row.routing_centroid ? (JSON.parse(row.routing_centroid) as number[]) : null;
      const prevN = prev ? row.routing_centroid_n : 0;
      const newVectors = agentEvents.map((e) => vecByEvent.get(e.id)).filter(Boolean) as number[][];
      const folded = foldCentroid(prev, prevN, newVectors);

      const samples: RoutingEventSample[] = agentEvents.map((e) => ({
        verdict: e.verdict as "accept" | "reject",
        text: e.text_head,
      }));
      const terms = learnTermWeights((row.routing_terms ?? {}) as Record<string, number>, samples);

      try {
        if (folded && newVectors.length > 0) {
          await prisma.$executeRaw`
            UPDATE agents
               SET routing_centroid = ${toVectorLiteral(folded.centroid)}::vector,
                   routing_centroid_model = ${embeddingsModel()},
                   routing_centroid_n = ${folded.n},
                   routing_terms = ${JSON.stringify(terms)}::jsonb
             WHERE id = ${agentId}::uuid AND org_id = ${orgId}::uuid`;
          stats.centroidsUpdated++;
        } else {
          await prisma.$executeRaw`
            UPDATE agents SET routing_terms = ${JSON.stringify(terms)}::jsonb
             WHERE id = ${agentId}::uuid AND org_id = ${orgId}::uuid`;
        }
        await prisma.routing_events.updateMany({
          where: { id: { in: agentEvents.map((e) => e.id) } },
          data: { consumed_at: new Date() },
        });
        stats.eventsFolded += agentEvents.length;
      } catch (e) {
        console.error(`[routing] profile update failed for agent ${agentId}`, e);
      }
    }
  } catch (e) {
    // Pre-migration DB lands here on the first query — the pass is dormant.
    console.log(`[routing] learning pass skipped: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
  return stats;
}
