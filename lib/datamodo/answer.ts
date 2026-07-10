import type { LlmProvider } from "@/lib/llm";
import type { SearchHit, KnowledgeHit } from "./search";
import type { ChunkHit } from "./chunks";

// Plain-language answers with citations — the second half of the search
// promise. We do NOT let the model roam: the keyword search (tables) and
// knowledge search (entities + facts) pick the evidence, we hand the model a
// numbered source list, and it must answer from those sources only, citing
// [n]. No sources → no answer. The context builder and citation parser are
// pure so they can be unit-tested; only answerQuestion talks to the LLM.

export interface AnswerSource {
  /** 1-based citation number used in the answer text as [n]. */
  n: number;
  type: "row" | "entity" | "passage";
  /** Short human label for the chip ("Invoices — Acme Inc" / "report.pdf · p.3"). */
  label: string;
  /** Where clicking the citation should take the user. */
  datasetId: string | null;
  entityId: string | null;
}

export interface GroundedAnswer {
  text: string;
  /** Only the sources the answer actually cites, in citation order. */
  sources: AnswerSource[];
}

// Keep the prompt lean: a handful of the best hits is plenty for grounding and
// keeps latency/cost down. Search already ranked them.
const MAX_ROW_SOURCES = 8;
const MAX_ENTITY_SOURCES = 6;
const MAX_PASSAGE_SOURCES = 5;

const cell = (v: string) => (v.length > 80 ? v.slice(0, 80) + "…" : v);

/** Compose the numbered evidence list the model answers from, plus the source
 *  index the UI needs to resolve [n] citations back to rows/entities/passages. */
export function buildAnswerContext(
  hits: SearchHit[],
  entities: KnowledgeHit[],
  passages: ChunkHit[] = [],
): { context: string; sources: AnswerSource[] } {
  const sources: AnswerSource[] = [];
  const lines: string[] = [];

  for (const e of entities.slice(0, MAX_ENTITY_SOURCES)) {
    const n = sources.length + 1;
    const facts = e.facts
      .map((f) => `${f.predicate.replace(/_/g, " ")}${f.ref ? " →" : ""} ${f.value}`)
      .join(" · ");
    lines.push(`[${n}] Known ${e.kind} "${e.label}"${facts ? `: ${facts}` : ""}`);
    sources.push({ n, type: "entity", label: e.label, datasetId: null, entityId: e.id });
  }

  for (const h of hits.slice(0, MAX_ROW_SOURCES)) {
    const n = sources.length + 1;
    const row = h.cells
      .filter((c) => c.value !== "")
      .map((c) => `${c.label}=${cell(c.value)}`)
      .join(" · ");
    const first = h.cells.find((c) => c.value !== "")?.value ?? "row";
    lines.push(`[${n}] Row in table "${h.datasetName}": ${row}`);
    sources.push({ n, type: "row", label: `${h.datasetName} — ${cell(first)}`, datasetId: h.datasetId, entityId: null });
  }

  // Passages from inside documents — the evidence layer's page-cited quotes.
  for (const p of passages.slice(0, MAX_PASSAGE_SOURCES)) {
    const n = sources.length + 1;
    lines.push(`[${n}] Passage from document "${p.docLabel}"${p.page ? ` (page ${p.page})` : ""}: "${p.text}"`);
    sources.push({
      n,
      type: "passage",
      label: `${p.docLabel}${p.page ? ` · p.${p.page}` : ""}`,
      datasetId: null,
      entityId: p.entityId,
    });
  }

  return { context: lines.join("\n"), sources };
}

/** Keep only the sources an answer really cites, in first-mention order.
 *  Returns null if the text cites nothing — an uncited answer is ungrounded
 *  and we'd rather show plain results than prose we can't back. */
export function citedSources(text: string, sources: AnswerSource[]): AnswerSource[] | null {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const seen = new Set<number>();
  const cited: AnswerSource[] = [];
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (!seen.has(n) && byN.has(n)) {
      seen.add(n);
      cited.push(byN.get(n)!);
    }
  }
  return cited.length ? cited : null;
}

const SYSTEM = `You answer a question about the user's OWN data. You are given a numbered list of sources — table rows and known entities with their facts — selected by a search over that data.

Rules:
- Answer ONLY from the sources. Never use outside knowledge, never guess.
- Cite the source number(s) [n] inline right after each claim they support.
- Be direct and brief: lead with the answer (a number, a name, a short sentence), add only essential context. Plain text, no markdown.
- If several sources give the pieces of one total, you may add them up — cite each piece.
- If the sources do not contain the answer, set answerable to false and leave answer empty. Do not apologize or explain.

Respond with ONLY JSON: {"answerable": <boolean>, "answer": "<the answer with [n] citations>"}`;

/**
 * Answer a question from the user's own search results. Best-effort by design:
 * any LLM/config problem returns null and the caller shows plain results.
 */
export async function answerQuestion(
  ownerUserId: string | null,
  question: string,
  hits: SearchHit[],
  entities: KnowledgeHit[],
  passages: ChunkHit[] = [],
): Promise<GroundedAnswer | null> {
  const { context, sources } = buildAnswerContext(hits, entities, passages);
  if (!context) return null;

  try {
    // Dynamic so this module stays runtime-import-free (the pure half is unit-
    // tested without Prisma/env; only the LLM path needs the provider stack).
    const { llmForUser } = await import("./llm-for-user");
    const llm: LlmProvider = await llmForUser(ownerUserId);
    const r = await llm.chatJSON<{ answerable?: boolean; answer?: string }>({
      model: llm.models.extract,
      system: SYSTEM,
      user: `Question: ${question}\n\nSources:\n${context}`,
      maxTokens: 4096,
      temperature: 0,
    });
    const text = (r.answer ?? "").trim();
    if (!r.answerable || !text) return null;
    const cited = citedSources(text, sources);
    if (!cited) return null;
    return { text, sources: cited };
  } catch {
    return null; // no key / rate limit / bad output — results still render
  }
}
