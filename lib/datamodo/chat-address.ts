// Chat addressing — the pure half of "talk to a specific agent" (ROADMAP:
// agent picker + inline @agent autocomplete). A message with no addressee
// goes to the GENERAL datamodo agent — deterministic, no silent guessing;
// picking an agent steers extraction with that agent's purpose. This module
// owns the @mention mechanics (where is the mention under the caret, which
// agents match); the view renders it, the API stores it. Pure — unit-tested.

/** The light agent shape the composer needs (full record stays server-side). */
export interface ChatAgentRef {
  id: string;
  name: string;
  /** The agent's purpose one-liner — shown inline so the user picks the
   *  right recipient without leaving the box. */
  purposeText: string | null;
}

export interface MentionSpan {
  /** Index of the "@" in the text. */
  start: number;
  /** End of the query (the caret position). */
  end: number;
  /** What was typed after the "@" (may contain spaces — agent names do). */
  query: string;
}

/**
 * The @mention being typed at `caret`, or null. Rules: the "@" must start the
 * text or follow whitespace (an email's "user@host" is never a mention); the
 * query runs from the "@" to the caret on the same line; a query longer than
 * 40 chars stopped being a mention attempt.
 */
export function activeMention(text: string, caret: number): MentionSpan | null {
  const upto = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  if (query.includes("\n") || query.length > 40) return null;
  return { start: at, end: upto.length, query };
}

/**
 * Agents matching a mention query, best first: name prefix, then any WORD
 * prefix ("rec" finds "The Recruiting one"), then substring. Empty query
 * lists everyone (the "@" alone opens the picker). Case-insensitive,
 * deterministic (rank, then name), capped at `limit`.
 */
export function matchAgents(agents: ChatAgentRef[], query: string, limit = 5): ChatAgentRef[] {
  const q = query.trim().toLowerCase();
  const rank = (a: ChatAgentRef): number => {
    if (!q) return 1;
    const name = a.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (name.includes(q)) return 2;
    return -1;
  };
  return agents
    .map((a) => ({ a, r: rank(a) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((x) => x.a);
}

/** Text with the mention span removed (choosing an agent from the popover
 *  claims the recipient slot — the token leaves the message body). */
export function stripMention(text: string, span: MentionSpan): string {
  const before = text.slice(0, span.start);
  const after = text.slice(span.end);
  // Collapse the doubled space the removal would leave behind.
  return (before + after).replace(/(^|\s)\s/, "$1");
}
