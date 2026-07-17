import { normalizeTerms } from "./agent-router.ts";

// ADAPTIVE ROUTING — the pure learning rules (GRAPH_PIPELINE.md "Adaptive
// classifiers (1)"): agent routing is a decision WITH feedback, so learn from
// acceptance. The labels come free (composer chip accepted/dismissed, an
// explicitly addressed send, an auto-routed item never corrected); this file
// turns them into two tiny, deterministic artifacts per agent:
//   · a CENTROID — the incremental mean of accepted messages' embeddings.
//     At route time the router adds cosine(message, centroid) as a score
//     boost, so paraphrases the lexical profile can't see still route.
//   · TERM WEIGHT CORRECTIONS — accepted messages nudge their terms up,
//     rejected ones nudge them down; the router folds these on top of the
//     static name+purpose profile.
// Contextual-bandit shape, zero training infra, zero LLM calls (the message
// embedding already exists for priming). Pure and unit-testable.

export interface RoutingEventSample {
  verdict: "accept" | "reject";
  text: string;
}

/** Past this many folded messages the centroid becomes an exponential-ish
 *  moving mean — old traffic stops outweighing what the agent is NOW for. */
export const CENTROID_MEMORY = 200;

/** Fold new accepted-message vectors into the running centroid (incremental
 *  mean, memory-capped). `prev = null` starts fresh. Returns the new centroid
 *  and the new fold count; never mutates inputs. */
export function foldCentroid(
  prev: number[] | null,
  prevN: number,
  vectors: number[][],
): { centroid: number[]; n: number } | null {
  const fresh = vectors.filter((v) => v && v.length > 0);
  if (fresh.length === 0) {
    return prev ? { centroid: prev, n: prevN } : null;
  }
  // The dimension is anchored by the existing centroid; a fresh start takes
  // it from the first new vector. Mismatched vectors never fold.
  const dim = prev && prev.length > 0 ? prev.length : fresh[0].length;
  let centroid = prev && prev.length === dim ? [...prev] : null;
  let n = centroid ? Math.max(0, prevN) : 0;
  for (const v of fresh) {
    if (v.length !== dim) continue; // mixed dims never fold
    if (!centroid) {
      centroid = [...v];
      n = 1;
      continue;
    }
    const weight = Math.min(n, CENTROID_MEMORY);
    for (let i = 0; i < dim; i++) centroid[i] = (centroid[i] * weight + v[i]) / (weight + 1);
    n++;
  }
  return centroid ? { centroid, n } : null;
}

/** One event's nudge per term. */
const LEARN_STEP = 0.25;
/** Corrections stay small relative to a distinctive lexical term (weight 1). */
const TERM_CLAMP = 1;
/** Keep only the strongest corrections — the profile must stay tiny. */
export const MAX_LEARNED_TERMS = 24;
/** Corrections that decayed to noise get dropped. */
const PRUNE_BELOW = 0.05;

/**
 * Update one agent's learned term-weight corrections from a batch of feedback
 * events. Accepted messages push their terms up, rejected ones down; weights
 * clamp to ±1 and the map keeps only the MAX_LEARNED_TERMS strongest.
 */
export function learnTermWeights(
  existing: Record<string, number>,
  events: RoutingEventSample[],
): Record<string, number> {
  const next = new Map<string, number>(Object.entries(existing).filter(([, w]) => Number.isFinite(w)));
  for (const ev of events) {
    const step = ev.verdict === "accept" ? LEARN_STEP : -LEARN_STEP;
    for (const term of new Set(normalizeTerms(ev.text))) {
      const w = (next.get(term) ?? 0) + step;
      next.set(term, Math.max(-TERM_CLAMP, Math.min(TERM_CLAMP, w)));
    }
  }
  const kept = [...next.entries()]
    .filter(([, w]) => Math.abs(w) >= PRUNE_BELOW)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, MAX_LEARNED_TERMS);
  return Object.fromEntries(kept);
}

/** Below this cosine the centroid says nothing about the message. */
export const CENTROID_SIM_FLOOR = 0.3;
/** A well-matched centroid is worth at most two fully-distinctive terms. */
const CENTROID_MAX_BOOST = 2;

/** Turn cosine(message, agent centroid) into an additive router-score boost.
 *  0 below the floor; ramps to CENTROID_MAX_BOOST by sim ≈ 0.7. */
export function centroidBoost(sim: number | null | undefined): number {
  if (sim == null || !Number.isFinite(sim) || sim <= CENTROID_SIM_FLOOR) return 0;
  return Math.min(CENTROID_MAX_BOOST, (sim - CENTROID_SIM_FLOOR) * 5);
}

/** A centroid fed fewer than this many accepted messages stays advisory-only
 *  (not enough evidence to boost routing scores). */
export const MIN_CENTROID_N = 5;
