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
  /** Ring grouping (the WOW engine's LOD idea, applied to the walk): when a
   *  hop would drown in spokes, the long tail of one kind collapses into ONE
   *  pseudo-node — this is its member list, importance-ordered. The entity is
   *  synthetic; clicking expands the members instead of walking. */
  clusterOf?: string[];
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
  /** Who introduced each node: hop-1 → the center, hop-2 → its first hop-1
   *  neighbor (hop-1 order). Drives layout sectors AND the 3D walk's
   *  enter-from-parent animation. */
  parentOf: Record<string, string>;
}

export interface EgoOptions {
  /** Ring caps: at most this many hop-1 / hop-2 nodes. */
  maxHop1?: number;
  maxHop2?: number;
  /** Nodes that must win a ring slot when the caps bite (e.g. the nodes an
   *  answer cited) — they rank before everything else, then connectedness. */
  prefer?: Set<string>;
  /** Ring grouping: instead of silently truncating the hop-1 tail, collapse
   *  it PER KIND into "+N more <kind>" pseudo-nodes ("a company with 30
   *  invoices doesn't need 30 spokes"). Preferred nodes are never folded. */
  clusterTail?: boolean;
  /** With clusterTail: at most this many individual nodes of ONE kind on the
   *  hop-1 ring before the rest of that kind folds into its cluster. */
  maxPerKind?: number;
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
  const preferred = (id: string) => (opts.prefer?.has(id) ? 1 : 0);
  const sortIds = (candidates: Iterable<string>, taken: Set<string>) =>
    [...candidates]
      .filter((id) => !taken.has(id))
      .sort(
        (a, b) =>
          preferred(b) - preferred(a) ||
          rank(b) - rank(a) ||
          (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? ""),
      );
  const pick = (candidates: Iterable<string>, cap: number, taken: Set<string>) => {
    const list = sortIds(candidates, taken);
    return { kept: list.slice(0, cap), dropped: list.length - Math.min(list.length, cap) };
  };

  const taken = new Set<string>([centerId]);
  let hop1Kept: string[];
  let hop1Dropped = 0;
  // Ring grouping: the sorted candidates fill the ring, but no kind may hog it
  // — past `maxPerKind` of one kind (or past the ring cap), the rest of that
  // kind folds into ONE "+N more" pseudo-node. Nothing is silently dropped.
  const clusters: { id: string; kind: string; members: string[] }[] = [];
  if (opts.clusterTail) {
    const perKind = opts.maxPerKind ?? 3;
    const sorted = sortIds(neighborIds.get(centerId) ?? [], taken);
    const kept: string[] = [];
    const kindCount = new Map<string, number>();
    const tail = new Map<string, string[]>();
    for (const id of sorted) {
      const kind = byId.get(id)!.kind;
      const kc = kindCount.get(kind) ?? 0;
      if (preferred(id) || (kept.length < maxHop1 && kc < perKind)) {
        kept.push(id);
        kindCount.set(kind, kc + 1);
      } else {
        if (!tail.has(kind)) tail.set(kind, []);
        tail.get(kind)!.push(id);
      }
    }
    // A lone straggler takes a free slot — a "+1 more" chip is worse noise.
    for (const [kind, members] of [...tail]) {
      if (members.length === 1 && kept.length < maxHop1) {
        kept.push(members[0]);
        tail.delete(kind);
      }
    }
    hop1Kept = kept;
    // Biggest tails first, then kind name — deterministic ring order.
    for (const [kind, members] of [...tail.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      clusters.push({ id: `cluster:${centerId}:${kind}`, kind, members });
      // Members are represented by their cluster — hop-2 must not re-pull them.
      members.forEach((m) => taken.add(m));
    }
  } else {
    const hop1 = pick(neighborIds.get(centerId) ?? [], maxHop1, taken);
    hop1Kept = hop1.kept;
    hop1Dropped = hop1.dropped;
  }
  hop1Kept.forEach((id) => taken.add(id));

  const hop2Candidates = new Set<string>();
  for (const id of hop1Kept) for (const n of neighborIds.get(id) ?? []) hop2Candidates.add(n);
  const hop2 = pick(hop2Candidates, maxHop2, taken);
  hop2.kept.forEach((id) => taken.add(id));

  // Introducers: hop-1 comes from the center; a hop-2 node belongs to the
  // FIRST kept hop-1 node (ring order) it neighbors — deterministic, and the
  // same rule the layout uses for sector placement.
  const parentOf: Record<string, string> = {};
  for (const id of hop1Kept) parentOf[id] = centerId;
  for (const c of clusters) parentOf[c.id] = centerId;
  for (const id of hop2.kept) {
    const parent = hop1Kept.find((p) => neighborIds.get(id)?.has(p)) ?? hop1Kept[0];
    if (parent) parentOf[id] = parent;
  }

  const mkNode = (id: string, hop: 0 | 1 | 2): EgoNode => {
    const e = byId.get(id)!;
    return { id, kind: e.kind, label: e.label, hop, entity: e };
  };
  const mkCluster = (c: { id: string; kind: string; members: string[] }): EgoNode => {
    const label = `+${c.members.length} more ${c.kind}${c.members.length === 1 ? "" : "s"}`;
    return {
      id: c.id,
      kind: c.kind,
      label,
      hop: 1,
      clusterOf: c.members,
      // Synthetic entity — enough for the card and the layout; never walked.
      entity: { id: c.id, kind: c.kind, label, naturalKeys: {}, facts: [], edges: c.members.length, bodyMd: null, graphPin: null },
    };
  };
  const nodes: EgoNode[] = [
    mkNode(centerId, 0),
    ...hop1Kept.map((id) => mkNode(id, 1)),
    ...clusters.map(mkCluster),
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

  // Cluster spokes: one edge per pseudo-node, labeled with the MAJORITY
  // predicate its members share with the center. The fact is synthetic —
  // the view opens the member list instead of the fact inspector.
  for (const c of clusters) {
    const counts = new Map<string, number>();
    const bump = (p: string) => counts.set(p, (counts.get(p) ?? 0) + 1);
    for (const mid of c.members) {
      for (const f of byId.get(mid)?.facts ?? []) if (f.ref && f.refId === centerId) bump(f.predicate);
      for (const f of center.facts) if (f.ref && f.refId === mid) bump(f.predicate);
    }
    const predicate =
      [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "related_to";
    const label = `+${c.members.length} more ${c.kind}${c.members.length === 1 ? "" : "s"}`;
    edges.push({
      from: c.id,
      to: centerId,
      predicate,
      fact: { predicate, value: center.label, ref: true, refId: centerId, sources: 0, provenance: [], confidence: 1, validFrom: null },
      fromLabel: label,
      toLabel: center.label,
    });
  }

  return { center: nodes[0], nodes, edges, truncated: hop1Dropped + hop2.dropped, parentOf };
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

  // Every hop-2 node sits in the angular sector of the hop-1 node that
  // introduced it (graph.parentOf — computed by buildEgoGraph).
  const bySector = new Map<string, string[]>();
  for (const n of hop2) {
    const parent = graph.parentOf[n.id] ?? hop1[0]?.id;
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

// --- Depth layout (Explorer v2 — the 3D graph walk) --------------------------
// Design handoff "Datamodo Explorer v2": the neighborhood lives in a CSS
// perspective depth field — center forward, hop-1 on the datum plane, hop-2
// pushed back (smaller, hazier). This is the pure math for it; the view only
// applies the transforms. Deterministic, unit-tested; `reduced` flattens all
// z to 0 (the prefers-reduced-motion 2D radial).

export const DEPTH = {
  perspective: 1250,
  centerZ: 150,
  hop1Z: 0,
  hop2Z: -230,
  /** hop-2 fans ± this many degrees around its parent's bearing. */
  hop2SpreadDeg: 34,
  /** Elliptical ring radii — x as a fraction of the canvas WIDTH, y of its
   *  HEIGHT (cards are wide, canvases are short; each axis fills its room). */
  r1x: 0.34,
  r1y: 0.34,
  r2x: 0.52,
  r2y: 0.46,
} as const;

export interface DepthPos {
  x: number;
  y: number;
  z: number;
  hop: 0 | 1 | 2;
  /** Who introduced this node (enter-from-parent flies in from here). */
  parent: string | null;
  /** Bearing on the ring, degrees (-90 = straight up). */
  angleDeg: number;
  /** Index within its ring/cluster — drives the enter stagger. */
  ring: number;
}

/**
 * Positions for the depth field, scaled to the canvas. Offsets are from the
 * canvas CENTER (the view translates them). Sparse hop-1 rings (1–2 nodes)
 * fan across the upper arc instead of leaving a lonely dot — per the design.
 */
export function depthLayout(
  graph: EgoGraph,
  width: number,
  height: number,
  reduced = false,
): Record<string, DepthPos> {
  const r1x = width * DEPTH.r1x;
  const r1y = height * DEPTH.r1y;
  const r2x = width * DEPTH.r2x;
  const r2y = height * DEPTH.r2y;

  const pos: Record<string, DepthPos> = {
    [graph.center.id]: {
      x: 0, y: 0, z: reduced ? 0 : DEPTH.centerZ, hop: 0, parent: null, angleDeg: 0, ring: 0,
    },
  };

  const hop1 = graph.nodes.filter((n) => n.hop === 1);
  const hop2 = graph.nodes.filter((n) => n.hop === 2);
  const bearing = new Map<string, number>();

  hop1.forEach((n, i) => {
    let deg: number;
    if (hop1.length === 1) deg = -90;
    else if (hop1.length === 2) deg = -140 + i * 100; // gentle upper arc
    else deg = -90 + (i * 360) / hop1.length;
    bearing.set(n.id, deg);
    const rad = (deg * Math.PI) / 180;
    pos[n.id] = {
      x: Math.cos(rad) * r1x,
      y: Math.sin(rad) * r1y,
      z: DEPTH.hop1Z,
      hop: 1, parent: graph.center.id, angleDeg: deg, ring: i,
    };
  });

  // hop-2 clusters around the bearing of the hop-1 node that introduced it.
  const kidsByParent = new Map<string, string[]>();
  for (const n of hop2) {
    const p = graph.parentOf[n.id] ?? hop1[0]?.id;
    if (!p) continue;
    if (!kidsByParent.has(p)) kidsByParent.set(p, []);
    kidsByParent.get(p)!.push(n.id);
  }
  for (const [pid, kids] of kidsByParent) {
    const baseDeg = bearing.get(pid) ?? -90;
    kids.forEach((id, i) => {
      // A lone child steps 14° aside so it peeks out from behind its parent
      // instead of hiding exactly on its bearing.
      const spread = kids.length === 1 ? 14 : ((i / (kids.length - 1)) - 0.5) * 2 * DEPTH.hop2SpreadDeg;
      const deg = baseDeg + spread;
      const rad = (deg * Math.PI) / 180;
      pos[id] = {
        x: Math.cos(rad) * r2x,
        y: Math.sin(rad) * r2y,
        z: reduced ? 0 : DEPTH.hop2Z,
        hop: 2, parent: pid, angleDeg: deg, ring: i,
      };
    });
  }
  return pos;
}
