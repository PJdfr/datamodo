import type { KnowledgeEntityView } from "./types";

// REVIEW GRAPH PREVIEW pure core (user ask 2026-07-16): one review row →
// the two futures of THAT decision as mini graph scenes — "if you accept"
// vs "if you refuse" — for the entity_merge / orphan_prune / fact_conflict
// kinds (the graph-shaped decisions). The modal renders these; this module
// only decides WHAT is in each scene. Works with or without the live graph:
// ids resolve to real neighborhoods when present, labels carry a fallback
// scene otherwise (the Studio's simulated preview mode).

export type PreviewRole = "center" | "neighbor" | "ghost" | "fade" | "value";
export interface PreviewNode {
  key: string;
  label: string;
  kind: string;
  role: PreviewRole;
}
export interface PreviewEdge {
  from: string;
  to: string;
  predicate: string;
  state: "keep" | "add" | "drop";
}
export interface PreviewScene {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  /** One plain sentence: what this future means. */
  note: string;
}
export interface ReviewPreview {
  accept: PreviewScene;
  refuse: PreviewScene;
}

export interface ReviewPreviewInput {
  kind: "entity_merge" | "orphan_prune" | "fact_conflict";
  sourceEntityId?: string | null;
  sourceLabel?: string;
  targetEntityId?: string | null;
  targetLabel?: string;
  subjectEntityId?: string | null;
  subjectLabel?: string;
  predicate?: string;
  was?: string;
  now?: string;
  orphans?: { id?: string; label: string; kind: string }[];
}

const NEIGHBOR_CAP = 5;

interface Neighbor {
  key: string;
  label: string;
  kind: string;
  predicate: string;
}

/** 1-hop entity neighbors (out-edges from its facts, in-edges from others'),
 *  capped. Attribute facts are not neighbors — this is the EDGE picture. */
function neighborsOf(views: KnowledgeEntityView[], id: string | null | undefined): Neighbor[] {
  if (!id) return [];
  const byId = new Map(views.map((v) => [v.id, v]));
  const me = byId.get(id);
  const out: Neighbor[] = [];
  const seen = new Set<string>();
  const push = (key: string, label: string, kind: string, predicate: string) => {
    if (seen.has(key) || out.length >= NEIGHBOR_CAP) return;
    seen.add(key);
    out.push({ key, label, kind, predicate });
  };
  for (const f of me?.facts ?? []) {
    if (f.ref && f.refId) push(f.refId, f.value, byId.get(f.refId)?.kind ?? "thing", f.predicate);
  }
  for (const v of views) {
    if (v.id === id) continue;
    for (const f of v.facts) {
      if (f.ref && f.refId === id) push(v.id, v.label, v.kind, f.predicate);
    }
  }
  return out;
}

function labelOf(views: KnowledgeEntityView[], id: string | null | undefined, fallback: string): { label: string; kind: string } {
  const v = id ? views.find((x) => x.id === id) : undefined;
  return { label: v?.label ?? fallback, kind: v?.kind ?? "thing" };
}

export function buildReviewPreview(
  views: KnowledgeEntityView[],
  input: ReviewPreviewInput,
): ReviewPreview | null {
  if (input.kind === "entity_merge") {
    const a = labelOf(views, input.sourceEntityId, input.sourceLabel ?? "the new one");
    const b = labelOf(views, input.targetEntityId, input.targetLabel ?? "the existing one");
    const an = neighborsOf(views, input.sourceEntityId);
    const bn = neighborsOf(views, input.targetEntityId);
    const A = "center:a";
    const B = "center:b";
    const refuse: PreviewScene = {
      nodes: [
        { key: A, label: a.label, kind: a.kind, role: "center" },
        { key: B, label: b.label, kind: b.kind, role: "center" },
        ...an.map((n) => ({ key: `a:${n.key}`, label: n.label, kind: n.kind, role: "neighbor" as const })),
        ...bn.map((n) => ({ key: `b:${n.key}`, label: n.label, kind: n.kind, role: "neighbor" as const })),
      ],
      edges: [
        ...an.map((n) => ({ from: A, to: `a:${n.key}`, predicate: n.predicate, state: "keep" as const })),
        ...bn.map((n) => ({ from: B, to: `b:${n.key}`, predicate: n.predicate, state: "keep" as const })),
      ],
      note: `They stay two separate ${a.kind === b.kind ? a.kind + "s" : "entities"} — nothing changes, and this pair is never asked again.`,
    };
    // Accept: one canonical node; the loser's edges re-point (shared
    // neighbors collapse to one node), the loser remains as a ghost.
    const seen = new Set(bn.map((n) => n.key));
    const gained = an.filter((n) => !seen.has(n.key));
    const accept: PreviewScene = {
      nodes: [
        { key: B, label: b.label, kind: b.kind, role: "center" },
        { key: A, label: a.label, kind: a.kind, role: "ghost" },
        ...bn.map((n) => ({ key: `b:${n.key}`, label: n.label, kind: n.kind, role: "neighbor" as const })),
        ...gained.map((n) => ({ key: `b:${n.key}`, label: n.label, kind: n.kind, role: "neighbor" as const })),
      ],
      edges: [
        { from: A, to: B, predicate: "merges into", state: "add" },
        ...bn.map((n) => ({ from: B, to: `b:${n.key}`, predicate: n.predicate, state: "keep" as const })),
        ...gained.map((n) => ({ from: B, to: `b:${n.key}`, predicate: n.predicate, state: "add" as const })),
      ],
      note: `"${a.label}" folds into "${b.label}": its ${an.length || "few"} connection${an.length === 1 ? "" : "s"} re-point to the one node. History and provenance are kept.`,
    };
    return { accept, refuse };
  }

  if (input.kind === "orphan_prune") {
    const orphans = input.orphans ?? [];
    if (orphans.length === 0) return null;
    const nodes = (role: PreviewRole): PreviewNode[] =>
      orphans.slice(0, 9).map((o, i) => ({ key: o.id ?? `o:${i}`, label: o.label, kind: o.kind, role }));
    return {
      accept: {
        nodes: nodes("fade"),
        edges: [],
        note: `These ${orphans.length} unlinked entit${orphans.length === 1 ? "y is" : "ies are"} deleted — but only the ones STILL unlinked and unread at accept time.`,
      },
      refuse: {
        nodes: nodes("neighbor"),
        edges: [],
        note: "They stay in the vault (still unlinked), and this batch is never asked about again.",
      },
    };
  }

  if (input.kind === "fact_conflict") {
    const s = labelOf(views, input.subjectEntityId, input.subjectLabel ?? "?");
    const S = "center:s";
    const predicate = (input.predicate ?? "value").replace(/_/g, " ");
    const mk = (current: "now" | "was"): PreviewScene => ({
      nodes: [
        { key: S, label: s.label, kind: s.kind, role: "center" },
        { key: "val:now", label: input.now ?? "?", kind: "new value", role: current === "now" ? "value" : "fade" },
        { key: "val:was", label: input.was ?? "?", kind: "previous value", role: current === "was" ? "value" : "fade" },
      ],
      edges: [
        { from: S, to: "val:now", predicate, state: current === "now" ? "keep" : "drop" },
        { from: S, to: "val:was", predicate, state: current === "was" ? "add" : "drop" },
      ],
      note:
        current === "now"
          ? "The newer value stays current; the old one remains in history (superseded, never deleted)."
          : "Reverts: the previous value becomes current again and the newer one is retired.",
    });
    return { accept: mk("now"), refuse: mk("was") };
  }

  return null;
}

// --- EXACT-Explorer rendering support (user call 2026-07-16: the real
// ExplorerView, not a replica): express each future as a TRANSFORMED
// KnowledgeEntityView[] the walk renders directly. Pure.

export interface FutureGraph {
  views: KnowledgeEntityView[];
  centerId: string | null;
  highlightIds: string[];
}

const clone = (v: KnowledgeEntityView): KnowledgeEntityView => ({ ...v, facts: v.facts.map((f) => ({ ...f })) });

/** Synthetic minimal views for simulated rows (labels without graph ids),
 *  so the real Explorer still has something to walk. */
function syntheticViews(input: ReviewPreviewInput): KnowledgeEntityView[] {
  const mk = (id: string, label: string, kind: string): KnowledgeEntityView => ({
    id, label, kind, naturalKeys: {}, bodyMd: null, graphPin: null, edges: 0, facts: [],
  });
  if (input.kind === "entity_merge") {
    const a = mk("sim:a", input.sourceLabel ?? "the new one", "note");
    const b = mk("sim:b", input.targetLabel ?? "the existing one", "note");
    a.facts.push({ predicate: "possible_duplicate_of", value: b.label, ref: true, refId: b.id, sources: 1, provenance: [], confidence: 1, validFrom: null });
    return [a, b];
  }
  if (input.kind === "orphan_prune") {
    return (input.orphans ?? []).map((o, i) => mk(o.id ?? `sim:o${i}`, o.label, o.kind));
  }
  const s = mk("sim:s", input.subjectLabel ?? "?", "note");
  s.facts.push({ predicate: input.predicate ?? "value", value: input.now ?? "?", ref: false, refId: null, sources: 1, provenance: [], confidence: 1, validFrom: null });
  return [s];
}

export function futureViews(
  all: KnowledgeEntityView[],
  input: ReviewPreviewInput,
  future: "accept" | "refuse",
): FutureGraph {
  const ids = new Set(all.map((v) => v.id));
  const resolveId = (id?: string | null) => (id && ids.has(id) ? id : null);
  let views = all.map(clone);
  if (input.kind === "entity_merge") {
    let a = resolveId(input.sourceEntityId);
    let b = resolveId(input.targetEntityId);
    if (!a || !b) {
      views = syntheticViews(input);
      a = "sim:a";
      b = "sim:b";
    }
    if (future === "refuse") return { views, centerId: b, highlightIds: [a, b] };
    const winner = views.find((v) => v.id === b)!;
    const loser = views.find((v) => v.id === a);
    if (loser) {
      winner.facts = [...winner.facts, ...loser.facts.filter((f) => f.refId !== b)];
      views = views.filter((v) => v.id !== a);
      for (const v of views) for (const f of v.facts) if (f.refId === a) { f.refId = b; f.value = winner.label; }
      winner.edges = winner.facts.length;
    }
    return { views, centerId: b, highlightIds: [b] };
  }
  if (input.kind === "orphan_prune") {
    const orphanIds = (input.orphans ?? []).map((o) => o.id).filter((x): x is string => !!x && ids.has(x));
    const base = orphanIds.length ? views : syntheticViews(input);
    const oIds = orphanIds.length ? orphanIds : base.map((v) => v.id);
    if (future === "refuse") return { views: base, centerId: oIds[0] ?? null, highlightIds: oIds };
    const kept = base.filter((v) => !oIds.includes(v.id));
    return { views: kept, centerId: kept[0]?.id ?? null, highlightIds: [] };
  }
  // fact_conflict: swap the disputed value on the subject.
  const sid = resolveId(input.subjectEntityId);
  const base = sid ? views : syntheticViews(input);
  const center = sid ?? "sim:s";
  const subject = base.find((v) => v.id === center);
  if (subject && input.predicate) {
    const want = future === "accept" ? input.now : input.was;
    for (const f of subject.facts) if (f.predicate === input.predicate) f.value = want ?? f.value;
    if (!subject.facts.some((f) => f.predicate === input.predicate) && want) {
      subject.facts.push({ predicate: input.predicate, value: want, ref: false, refId: null, sources: 1, provenance: [], confidence: 1, validFrom: null });
    }
  }
  return { views: base, centerId: center, highlightIds: [center] };
}
