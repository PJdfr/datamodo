// ON-DEMAND SYNTHESIS (pure core, type imports only) — the north-star rule:
// generation happens when the USER asks (the "✦ Synthesize" button), never by
// a background trigger. This module assembles everything around one entity —
// the connected documents/notes and their summaries — into a numbered source
// list + prompt; the LLM writes ONE cited markdown note from those sources
// only; renderSynthesisBody appends the deterministic Sources footer so every
// [n] in the note resolves to something real. The result lands in the
// entity's body_md (a thick node WE authored, clearly stamped as synthesized).

import type { KnowledgeEntityView } from "./types";

export interface SynthesisSource {
  /** 1-based citation number, used in the note as [n]. */
  n: number;
  id: string;
  kind: string;
  label: string;
  /** What the model reads: the source's summary/body, trimmed. */
  excerpt: string;
}

/** Keep the prompt bounded: a synthesis reads at most this many sources /
 *  characters per source. */
export const MAX_SYNTHESIS_SOURCES = 8;
export const MAX_EXCERPT_CHARS = 1_500;

/**
 * The content entities a synthesis of `entity` would read: everything with a
 * generated body (documents, notes, understood images) connected to it by a
 * relationship fact IN EITHER DIRECTION (a document `about` the concept, the
 * concept `related_to` something with content…). Deterministic order:
 * best-connected first, then label.
 */
export function collectSynthesisSources(
  entity: KnowledgeEntityView,
  all: KnowledgeEntityView[],
): SynthesisSource[] {
  const linked = new Set<string>();
  for (const f of entity.facts) if (f.ref && f.refId) linked.add(f.refId);
  for (const e of all) {
    if (e.id === entity.id) continue;
    if (e.facts.some((f) => f.ref && f.refId === entity.id)) linked.add(e.id);
  }

  const byId = new Map(all.map((e) => [e.id, e]));
  const candidates = [...linked]
    .map((id) => byId.get(id))
    .filter((e): e is KnowledgeEntityView => Boolean(e && e.bodyMd && e.bodyMd.trim()))
    .sort((a, b) => b.edges - a.edges || a.label.localeCompare(b.label))
    .slice(0, MAX_SYNTHESIS_SOURCES);

  return candidates.map((e, i) => ({
    n: i + 1,
    id: e.id,
    kind: e.kind,
    label: e.label,
    excerpt: e.bodyMd!.trim().slice(0, MAX_EXCERPT_CHARS),
  }));
}

/** A "✦ Synthesize" button makes sense when there are at least two bodies of
 *  content to draw together — one source would just be a copy. */
export function canSynthesize(entity: KnowledgeEntityView, all: KnowledgeEntityView[]): boolean {
  return collectSynthesisSources(entity, all).length >= 2;
}

/** The prompt pair for the synthesis call. The model must answer from the
 *  numbered sources only, citing [n] — same grounding contract as answers. */
export function buildSynthesisPrompt(
  entity: KnowledgeEntityView,
  sources: SynthesisSource[],
): { system: string; user: string } {
  const attrs = entity.facts
    .filter((f) => !f.ref)
    .slice(0, 12)
    .map((f) => `${f.predicate.replace(/_/g, " ")}: ${f.value}`)
    .join(" · ");
  const sourceBlock = sources
    .map((s) => `[${s.n}] ${s.label} (${s.kind})\n${s.excerpt}`)
    .join("\n\n");
  return {
    system: [
      "You synthesize a user's own documents into one short note. Rules:",
      "- Use ONLY the numbered sources provided. Never invent facts.",
      "- Cite every claim with its source number like [1] or [2][3].",
      "- Markdown: start with a one-line summary paragraph, then a few short sections or bullets. No top-level heading (the page provides the title).",
      "- Keep it under ~300 words. Plain, concrete language.",
      'Respond as JSON: {"note_md": "..."}',
    ].join("\n"),
    user: `Subject: ${entity.label} (${entity.kind})${attrs ? `\nKnown attributes: ${attrs}` : ""}\n\nSources:\n\n${sourceBlock}`,
  };
}

/** Stitch the model's note + OUR deterministic footer (provenance stamp and
 *  numbered source list) into the body_md that lands on the entity. Pass
 *  `generatedOn` (YYYY-MM-DD) so tests stay deterministic. */
export function renderSynthesisBody(
  noteMd: string,
  sources: SynthesisSource[],
  generatedOn: string,
): string {
  const list = sources.map((s) => `${s.n}. ${s.label} (${s.kind.replace(/_/g, " ")})`).join("\n");
  return [
    noteMd.trim(),
    "",
    "#### Sources",
    list,
    "",
    `*Synthesized on ${generatedOn} from ${sources.length} source${sources.length === 1 ? "" : "s"} — generated because you asked, never automatically.*`,
  ].join("\n");
}
