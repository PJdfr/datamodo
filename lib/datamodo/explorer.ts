// EXPLORER — the ego-graph projection: stand on one node, look around.
// One node is the CENTER; its neighborhood (up to 2 hops of relationship
// facts, both directions) is the visible world; every edge carries the FACT
// behind it (predicate, confidence, since-when, provenance) — an edge is more
// than a link. Recentering on a neighbor is how you walk the graph.
// Pure module (type imports only) — unit-tests under node:test; the view
// (app/dashboard/explorer-view.tsx) renders what this computes.

import type { KnowledgeEntityView, KnowledgeFactView } from "./types";

export interface EgoNode {
  id: string;
  kind: string;
  label: string;
  /** 0 = the center, 1/2 = rings outward. */
  hop: 0 | 1 | 2;
  entity: KnowledgeEntityView;
}

export interface EgoEdge {
  /** Direction is the fact's: subject --predicate--> object. */
  from: string;
  to: string;
  predicate: string;
  /** The fact behind the edge — time, confidence, sources live here. */
  fact: KnowledgeFactView;
  /** The subject's label (the edge inspector reads "A issued_by B"). */
  fromLabel: string;
  toLabel: string;
}

export interface EgoGraph {
  center: EgoNode;
  /** Center first, then hop 1, then hop 2 — each ring importance-ordered. */
  nodes: EgoNode[];
  edges: EgoEdge[];
  /** Neighbors that exist but didn't fit the caps. */
  truncated: number;
}

export interface EgoOptions {
  /** Ring caps: at most this many hop-1 / hop-2 nodes. */
  maxHop1?: number;
  maxHop2?: number;
}

/**
 * Build the neighborhood around `centerId`. Deterministic: neighbors rank by
 * their own connectedness (edges desc), then label. Returns null when the
 * center isn't in the view.
 */
export function buildEgoGraph(
  entities: KnowledgeEntityView[],
  centerId: string,
  opts: EgoOptions = {},
): EgoGraph | null {
  const maxHop1 = opts.maxHop1 ?? 14;
  const maxHop2 = opts.maxHop2 ?? 18;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const center = byId.get(centerId);
  if (!center) return null;

  // Adjacency over relationship facts, both directions.
  const neighborIds = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!neighborIds.has(a)) neighborIds.set(a, new Set());
    neighborIds.get(a)!.add(b);
  };
  for (const e of entities) {
    for (const f of e.facts) {
      if (f.ref && f.refId && byId.has(f.refId) && f.refId !== e.id) {
        link(e.id, f.refId);
        link(f.refId, e.id);
      }
    }
  }

  const rank = (id: string) => byId.get(id)?.edges ?? 0;
  const pick = (candidates: Iterable<string>, cap: number, taken: Set<string>) => {
    const list = [...candidates]
      .filter((id) => !taken.has(id))
      .sort((a, b) => rank(b) - rank(a) || (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? ""));
    return { kept: list.slice(0, cap), dropped: list.length - Math.min(list.length, cap) };
  };

  const taken = new Set<string>([centerId]);
  const hop1 = pick(neighborIds.get(centerId) ?? [], maxHop1, taken);
  hop1.kept.forEach((id) => taken.add(id));

  const hop2Candidates = new Set<string>();
  for (const id of hop1.kept) for (const n of neighborIds.get(id) ?? []) hop2Candidates.add(n);
  const hop2 = pick(hop2Candidates, maxHop2, taken);
  hop2.kept.forEach((id) => taken.add(id));

  const mkNode = (id: string, hop: 0 | 1 | 2): EgoNode => {
    const e = byId.get(id)!;
    return { id, kind: e.kind, label: e.label, hop, entity: e };
  };
  const nodes: EgoNode[] = [
    mkNode(centerId, 0),
    ...hop1.kept.map((id) => mkNode(id, 1)),
    ...hop2.kept.map((id) => mkNode(id, 2)),
  ];

  // Edges among included nodes only, deduped by (subject, object, predicate).
  const included = new Set(nodes.map((n) => n.id));
  const edges: EgoEdge[] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    if (!included.has(e.id)) continue;
    for (const f of e.facts) {
      if (!f.ref || !f.refId || !included.has(f.refId) || f.refId === e.id) continue;
      const key = `${e.id}~${f.refId}~${f.predicate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: e.id,
        to: f.refId,
        predicate: f.predicate,
        fact: f,
        fromLabel: e.label,
        toLabel: byId.get(f.refId)?.label ?? "?",
      });
    }
  }

  return { center: nodes[0], nodes, edges, truncated: hop1.dropped + hop2.dropped };
}

// --- Radial layout ---------------------------------------------------------------

export interface EgoPos {
  x: number;
  y: number;
}

/**
 * Concentric layout: center in the middle, hop-1 on an inner ring, hop-2 on an
 * outer ring near the hop-1 node that pulled it in. Deterministic — no
 * randomness, stable between renders for the same graph.
 */
export function radialLayout(graph: EgoGraph, width: number, height: number): Record<string, EgoPos> {
  const cx = width / 2;
  const cy = height / 2;
  const r1 = Math.min(width, height) * 0.28;
  const r2 = Math.min(width, height) * 0.46;
  const pos: Record<string, EgoPos> = { [graph.center.id]: { x: cx, y: cy } };

  const hop1 = graph.nodes.filter((n) => n.hop === 1);
  const hop2 = graph.nodes.filter((n) => n.hop === 2);

  const angleOf = new Map<string, number>();
  hop1.forEach((n, i) => {
    const a = (i / Math.max(1, hop1.length)) * Math.PI * 2 - Math.PI / 2;
    angleOf.set(n.id, a);
    pos[n.id] = { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 * 0.82 };
  });

  // Every hop-2 node sits in the angular sector of its first hop-1 neighbor.
  const adjacency = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(e.to);
    adjacency.get(e.to)!.push(e.from);
  }
  const hop1Ids = new Set(hop1.map((n) => n.id));
  const bySector = new Map<string, string[]>();
  for (const n of hop2) {
    const parent = (adjacency.get(n.id) ?? []).find((id) => hop1Ids.has(id)) ?? hop1[0]?.id;
    if (!parent) continue;
    if (!bySector.has(parent)) bySector.set(parent, []);
    bySector.get(parent)!.push(n.id);
  }
  for (const [parent, ids] of bySector) {
    const base = angleOf.get(parent) ?? -Math.PI / 2;
    ids.forEach((id, i) => {
      // Fan the children symmetrically around the parent's angle.
      const spread = Math.min(0.5, 0.16 * ids.length);
      const a = base + (ids.length === 1 ? 0 : -spread + (i / (ids.length - 1)) * spread * 2);
      pos[id] = { x: cx + Math.cos(a) * r2, y: cy + Math.sin(a) * r2 * 0.82 };
    });
  }
  return pos;
}
