// ZERO-COST AGENT ROUTING — a deterministic lexical classifier that decides
// which agent's purpose should steer extraction for an UNADDRESSED item in
// auto mode. No LLM call, no API, no spend — per-message routing must cost
// nothing or auto mode becomes too expensive (user call 2026-07-16; this
// builds the ROADMAP's deferred "reroute" step the free way).
//
// How it scores: each agent's name + purpose text becomes a keyword profile;
// terms that appear in FEWER profiles weigh more (a term unique to one agent
// is decisive, a term every agent shares is worthless for choosing between
// them). A message routes to the top agent only when its score clears an
// absolute floor AND a margin over the runner-up — ambiguity falls back to
// the generic datamodo agent, never a coin flip. Pure and import-free.

export interface AgentSeed {
  id: string;
  name: string;
  purposeText: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  /** Normalized term → weight (set once per profile build). */
  terms: Map<string, number>;
}

export interface RouteHit {
  agentId: string;
  name: string;
  score: number;
  runnerUpScore: number;
  /** The matched terms, weight-ordered — the explainable "why". */
  matched: string[];
}

/** Words too generic to distinguish one agent's purpose from another's. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "from",
  "with", "about", "into", "onto", "over", "under", "after", "before", "all",
  "any", "some", "this", "that", "these", "those", "is", "are", "be", "been",
  "was", "were", "it", "its", "as", "at", "by", "we", "you", "your", "my",
  "our", "their", "his", "her", "they", "them", "i", "me", "us", "will",
  "would", "should", "shall", "can", "could", "may", "might", "must", "do",
  "does", "did", "done", "not", "no", "yes", "if", "then", "than", "when",
  "what", "which", "who", "how", "why", "where", "everything", "anything",
  // purpose-text boilerplate — present in almost every agent description
  "keep", "keeps", "track", "tracks", "tracking", "watch", "watches",
  "watching", "manage", "manages", "managing", "follow", "follows", "handle",
  "handles", "collect", "collects", "capture", "captures", "agent", "agents",
  "every", "each", "new", "incoming", "sent", "received", "related",
  "message", "messages", "email", "emails", "mail", "mails", "inbox",
  "stuff", "thing", "things", "data", "info", "information", "items",
]);

/** Lowercase, split, drop stopwords/short tokens, fold simple plurals so
 *  "invoices" in a purpose matches "invoice" in a message (and vice versa). */
export function normalizeTerms(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9à-öø-ÿ]+/i)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    let t = raw;
    // Fold plurals so "invoices" (purpose) meets "invoice" (message). The +es
    // forms (boxes/matches) drop "es"; everything else drops one "s" — but
    // never from "ss" (address) or short words.
    if (t.length > 4 && /(?:s|x|z|ch|sh)es$/.test(t)) t = t.slice(0, -2);
    else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
    out.push(t);
  }
  return out;
}

/**
 * Build the keyword profiles. Term weight = 1 / (number of profiles the term
 * appears in) — fully distinctive terms weigh 1, shared terms proportionally
 * less. Name terms count double (the name is the user's own label for what
 * the agent is about).
 */
export function buildAgentProfiles(agents: AgentSeed[]): AgentProfile[] {
  const perAgent = agents.map((a) => ({
    id: a.id,
    name: a.name,
    nameTerms: new Set(normalizeTerms(a.name)),
    all: new Set([...normalizeTerms(a.name), ...normalizeTerms(a.purposeText)]),
  }));
  const df = new Map<string, number>();
  for (const p of perAgent) for (const t of p.all) df.set(t, (df.get(t) ?? 0) + 1);
  return perAgent.map((p) => {
    const terms = new Map<string, number>();
    for (const t of p.all) {
      const idf = 1 / (df.get(t) ?? 1);
      terms.set(t, p.nameTerms.has(t) ? idf * 2 : idf);
    }
    return { id: p.id, name: p.name, terms };
  });
}

export interface RouteOptions {
  /** Minimum absolute score — roughly "one fully-distinctive term". */
  minScore?: number;
  /** The winner must beat the runner-up by this much... */
  minLead?: number;
  /** ...and by this ratio (both guard different shapes of ambiguity). */
  minRatio?: number;
}

/**
 * Route a message to the best-matching agent, or null when nothing clears the
 * bar (→ the generic datamodo agent). Deterministic: ties and ambiguity never
 * route.
 */
export function routeToAgent(
  text: string,
  profiles: AgentProfile[],
  opts: RouteOptions = {},
): RouteHit | null {
  const minScore = opts.minScore ?? 1;
  const minLead = opts.minLead ?? 0.5;
  const minRatio = opts.minRatio ?? 1.5;
  if (profiles.length === 0) return null;
  const messageTerms = new Set(normalizeTerms(text));
  if (messageTerms.size === 0) return null;

  const scored = profiles
    .map((p) => {
      let score = 0;
      const matched: [string, number][] = [];
      for (const [t, w] of p.terms) {
        if (messageTerms.has(t)) {
          score += w;
          matched.push([t, w]);
        }
      }
      matched.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return { p, score, matched: matched.map(([t]) => t) };
    })
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));

  const [best, second] = scored;
  const runnerUp = second?.score ?? 0;
  if (best.score < minScore) return null;
  if (runnerUp > 0 && (best.score - runnerUp < minLead || best.score < runnerUp * minRatio)) return null;
  return { agentId: best.p.id, name: best.p.name, score: best.score, runnerUpScore: runnerUp, matched: best.matched };
}
