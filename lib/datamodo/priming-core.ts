// RELEVANCE PRIMING pure core (GRAPH_PIPELINE.md — entity priming, user call
// 2026-07-16): rank the graph entities worth showing the extraction LLM for
// ONE message, so labels come out consistent at the source ("J. Porter" →
// "James Porter") and tier-0 resolution lands instead of burning
// adjudication calls. Replaces the static top-30-by-support concept list
// with candidates chosen BY the input. No Prisma, no LLM — the DB legs live
// in priming.ts; tests in tests/priming.test.ts.
//
// Safety framing (the silent-merge risk): priming shows LABELS ONLY, never
// ids; the prompt says "if unsure it's the same thing, use the message's own
// wording"; and identity is still decided by resolveEntity — priming just
// makes its deterministic tiers hit more often. Non-concepts require
// support ≥ 2 unless the message literally names them (a one-mention stray
// must not attract a force-fit).

export interface PrimedCandidate {
  kind: string;
  label: string;
  /** Strongest natural key, for the prompt hint ("bob@acme.com"). */
  hint?: string;
  support: number;
  /** ANN similarity when the candidate came from the semantic leg. */
  sim?: number;
  /** True when the label literally appears in the message text. */
  named?: boolean;
}

export const PRIME_CAP = 15;
export const PRIME_MIN_SIM = 0.3;

/** Merge the lexical leg (labels literally in the text — strongest evidence,
 *  first) with the ANN leg (semantically near — by similarity), dedupe by
 *  kind+label, apply the support floor, cap. */
export function rankPrimedCandidates(
  lexical: PrimedCandidate[],
  ann: PrimedCandidate[],
  cap: number = PRIME_CAP,
): PrimedCandidate[] {
  const seen = new Set<string>();
  const out: PrimedCandidate[] = [];
  const push = (c: PrimedCandidate) => {
    const key = `${c.kind}::${c.label.toLowerCase()}`;
    if (seen.has(key) || out.length >= cap) return;
    seen.add(key);
    out.push(c);
  };
  for (const c of lexical.slice().sort((a, b) => b.support - a.support)) push({ ...c, named: true });
  for (const c of ann.slice().sort((a, b) => (b.sim ?? 0) - (a.sim ?? 0))) {
    if ((c.sim ?? 0) < PRIME_MIN_SIM) continue;
    // Semantic-only candidates need corroboration; concepts are exempt —
    // they ARE the leash, and tagging one adds an edge, not an identity.
    if (c.kind !== "concept" && c.support < 2) continue;
    push(c);
  }
  return out;
}

/** Render the prompt's "already in your graph" block (non-concept entities
 *  only — concepts have their own leash line). Null when there is nothing
 *  worth showing. Labels only, never ids; the never-force rule keeps the
 *  cheap model from flattening uncertain identity at write time. */
export function renderKnownBlock(known: { kind: string; label: string; hint?: string }[]): string | null {
  const rows = known.filter((k) => k.kind !== "concept");
  if (rows.length === 0) return null;
  return (
    "ALREADY IN the user's graph and likely related to this message:\n" +
    rows.map((k) => `- ${k.kind}: "${k.label}"${k.hint ? ` (${k.hint})` : ""}`).join("\n") +
    "\nIf the message refers to one of these, reuse its EXACT label and kind so the fact lands on the same record. If you are NOT sure it is the same real-world thing, use the message's own wording instead — never force a match."
  );
}

/** The concepts line for the prompt: primed (input-relevant) concept labels
 *  first, topped up from the support-ranked fallback so the leash never goes
 *  empty when embeddings are down or the vault is young. */
export function conceptsForPrompt(
  primed: PrimedCandidate[],
  supportRanked: string[],
  cap = 12,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of primed) {
    if (c.kind !== "concept" || seen.has(c.label.toLowerCase()) || out.length >= cap) continue;
    seen.add(c.label.toLowerCase());
    out.push(c.label);
  }
  for (const label of supportRanked) {
    if (out.length >= cap) break;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out;
}
