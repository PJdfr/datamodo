import type { DocChunk } from "./document-extraction.ts";

// CHUNK-IMPORTANCE SELECTION (user call 2026-07-16: "no limit on PDF size,
// but we don't need to put everything in the LLM context — classify which
// chunks matter"). The whole document is read, chunked, and stored; THIS
// pure, zero-LLM scorer decides which chunks ride the distill prompt.
// Signals, all deterministic:
//   · section headers — results/summary/conclusions up, references/appendix
//     down (the tail of a paper is citations, not knowledge);
//   · information density — digits, %, currency: where the numbers live;
//   · key-term overlap — the classified kind's template vocabulary and the
//     agents' purposes name EXACTLY what the user wants extracted;
//   · position — openings (title/abstract/intro) carry the frame.
// The opening chunks are always included (the primary subject lives there),
// the rest fill a character budget by score, and the final text is
// re-ordered by document position with [p.N] markers and elision marks so
// the model knows it is reading a selection.

/** How much document text the distill prompt may carry. Selection only
 *  engages ABOVE this budget — short documents keep the full text. */
export const DOC_PROMPT_BUDGET_CHARS = 24_000;

/** Opening chunks that always make the prompt (title/abstract/intro). */
const ALWAYS_FIRST = 2;

const BOOST_HEADINGS = /\b(abstract|summary|overview|conclusion|conclusions|results|findings|performance|key\s+takeaways?|executive\s+summary|returns?|method(?:ology)?)\b/i;
const DEMOTE_HEADINGS = /\b(references|bibliography|acknowledg\w*|disclaimer|disclosures?|appendix|table\s+of\s+contents|copyright|about\s+the\s+authors?)\b/i;

/** Tokenize free text (template labels, agent purposes) into scoring terms —
 *  words ≥ 4 chars, deduped, lowercase. */
export function keyTermsFrom(...texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const w of (t ?? "").toLowerCase().split(/[^a-z0-9%€$]+/)) {
      if (w.length >= 4) out.add(w);
    }
  }
  return [...out];
}

/** Score one chunk. Pure; roughly -3 … +8. */
export function scoreChunk(
  chunk: Pick<DocChunk, "text" | "seq">,
  ctx: { totalChunks: number; keyTerms: string[] },
): number {
  const text = chunk.text;
  const head = text.slice(0, 120);
  let score = 0;
  if (DEMOTE_HEADINGS.test(head)) score -= 3;
  if (BOOST_HEADINGS.test(head)) score += 2;
  // Information density: digits / % / currency per 100 chars, capped.
  const signals = (text.match(/[0-9]|[%€$£]/g) ?? []).length;
  score += Math.min(2, (signals / Math.max(1, text.length)) * 100 * 0.25);
  // Key-term overlap: the user's vocabulary appearing in the chunk.
  if (ctx.keyTerms.length) {
    const lower = text.toLowerCase();
    let hits = 0;
    for (const term of ctx.keyTerms) if (lower.includes(term)) hits++;
    score += Math.min(3, hits * 0.5);
  }
  // Position: the first tenth carries the frame; the last tenth is usually
  // back-matter even when its heading didn't say so.
  const pos = ctx.totalChunks > 1 ? chunk.seq / (ctx.totalChunks - 1) : 0;
  if (pos <= 0.1) score += 1.5;
  else if (pos >= 0.9) score -= 0.5;
  return score;
}

export interface ChunkSelection {
  /** Prompt-ready text: selected chunks in document order, page-marked,
   *  elisions marked. */
  text: string;
  includedSeqs: number[];
  droppedChunks: number;
}

/** Pick the chunks worth showing the distill LLM, within the budget. */
export function selectChunksForPrompt(
  chunks: DocChunk[],
  ctx: { keyTerms: string[]; budgetChars?: number },
): ChunkSelection {
  const budget = ctx.budgetChars ?? DOC_PROMPT_BUDGET_CHARS;
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  if (total <= budget) {
    return { text: chunks.map((c) => c.text).join("\n\n"), includedSeqs: chunks.map((c) => c.seq), droppedChunks: 0 };
  }
  const scored = chunks.map((c) => ({ c, score: scoreChunk(c, { totalChunks: chunks.length, keyTerms: ctx.keyTerms }) }));
  const included = new Map<number, DocChunk>();
  let used = 0;
  const take = (c: DocChunk) => {
    if (included.has(c.seq) || used + c.text.length > budget) return;
    included.set(c.seq, c);
    used += c.text.length;
  };
  // Openings first (the primary subject), then everything else by score.
  for (const s of scored.slice(0, ALWAYS_FIRST)) take(s.c);
  for (const s of scored.slice().sort((a, b) => b.score - a.score)) take(s.c);

  const ordered = [...included.values()].sort((a, b) => a.seq - b.seq);
  const parts: string[] = [];
  let prevSeq = -1;
  for (const c of ordered) {
    if (prevSeq >= 0 && c.seq > prevSeq + 1) parts.push("[… less relevant passages omitted …]");
    parts.push(c.page != null ? `[p.${c.page}] ${c.text}` : c.text);
    prevSeq = c.seq;
  }
  return {
    text: parts.join("\n\n"),
    includedSeqs: ordered.map((c) => c.seq),
    droppedChunks: chunks.length - ordered.length,
  };
}
