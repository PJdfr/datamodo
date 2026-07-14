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

/**
 * The ONE adjacency rule for every graph surface (the walk AND the
 * constellation's semantic zoom — if edges were computed twice they'd drift):
 * a fact with `ref && refId` pointing at another known entity is an undirected
 * edge, weighted by how many facts connect the pair (both directions).
 * Returns node id → (neighbor id → fact count).
 */
export function buildAdjacency(entities: KnowledgeEntityView[]): Map<string, Map<string, number>> {
  const known = new Set(entities.map((e) => e.id));
  const adj = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Map());
    const m = adj.get(a)!;
    m.set(b, (m.get(b) ?? 0) + 1);
  };
  for (const e of entities) {
    for (const f of e.facts) {
      if (f.ref && f.refId && known.has(f.refId) && f.refId !== e.id) {
        bump(e.id, f.refId);
        bump(f.refId, e.id);
      }
    }
  }
  return adj;
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

  // Adjacency over relationship facts, both directions (the shared rule).
  const adjacency = buildAdjacency(entities);
  const neighborIds = new Map<string, Set<string>>();
  for (const [id, nbrs] of adjacency) neighborIds.set(id, new Set(nbrs.keys()));

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

// --- Layered ego (the Explorer's zoom-out) -----------------------------------
// "Zoom out = more layers" (user decision 2026-07-13, replacing the physics
// map): the whole reachable world as concentric BFS rings around the CENTER.
// Every node gets a PERMANENT bearing via deterministic wedge subdivision (a
// radial tree: each subtree owns an angular slice of its parent's wedge, so
// children always sit behind their parent). Zoom only rescales ring radii and
// reveals/hides rings — positions never re-flow, so nothing can wiggle, and a
// node that disappears reappears at the same bearing. Per-parent long tails
// fold into "+N more" chips (the walk's ring-grouping rule at every depth);
// entities unreachable from the center form one final dashed ring.

export interface LayerNode {
  id: string;
  /** 0 = the center; k = the k-th ring out. */
  hop: number;
  /** Fixed bearing in degrees (-90 = straight up). Never changes with zoom. */
  angleDeg: number;
  parent: string | null;
  entity: KnowledgeEntityView;
  /** "+N more" chip: the folded sibling ids (synthetic entity, not walkable). */
  clusterOf?: string[];
  /** False on the outermost ring — entities with no path to the center. */
  linked: boolean;
}

export interface LayeredEgo {
  center: LayerNode;
  /** Center first, then ring by ring in wedge order. */
  nodes: LayerNode[];
  /** Relationship facts among kept real nodes, plus one spoke per chip
   *  (chip spokes carry an empty predicate). */
  edges: { from: string; to: string; predicate: string }[];
  /** The deepest ring, including the unlinked ring when present. */
  maxHop: number;
}

export interface LayeredOptions {
  /** Per parent, at most this many children spread onto the next ring —
   *  the rest fold into one "+N more" chip. */
  maxChildren?: number;
  /** Cap on the unlinked outer ring (overflow folds into a chip too). */
  maxUnlinked?: number;
}

export function buildLayeredEgo(
  entities: KnowledgeEntityView[],
  centerId: string,
  opts: LayeredOptions = {},
): LayeredEgo | null {
  const maxChildren = opts.maxChildren ?? 7;
  const maxUnlinked = opts.maxUnlinked ?? 36;
  const byId = new Map(entities.map((e) => [e.id, e]));
  if (!byId.has(centerId)) return null;
  const adj = buildAdjacency(entities);
  const rank = (id: string) => byId.get(id)?.edges ?? 0;
  const sortIds = (ids: Iterable<string>) =>
    [...ids].sort(
      (a, b) =>
        rank(b) - rank(a) ||
        (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? "") ||
        a.localeCompare(b),
    );

  // BFS tree with per-parent folding — deterministic ring order.
  interface TNode { id: string; hop: number; parent: string | null; children: TNode[]; clusterOf?: string[]; weight: number }
  const mkT = (id: string, hop: number, parent: string | null): TNode => ({ id, hop, parent, children: [], weight: 1 });
  const rootT = mkT(centerId, 0, null);
  const visited = new Set([centerId]);
  let frontier = [rootT];
  let linkedMax = 0;
  while (frontier.length) {
    const next: TNode[] = [];
    for (const t of frontier) {
      const cand = sortIds([...(adj.get(t.id)?.keys() ?? [])].filter((id) => !visited.has(id)));
      let kept = cand.slice(0, maxChildren);
      let tail = cand.slice(maxChildren);
      if (tail.length === 1) { kept = cand; tail = []; } // lone straggler takes the slot
      for (const id of kept) {
        visited.add(id);
        const c = mkT(id, t.hop + 1, t.id);
        t.children.push(c);
        next.push(c);
        linkedMax = Math.max(linkedMax, c.hop);
      }
      if (tail.length) {
        tail.forEach((id) => visited.add(id)); // folded away — never re-pulled
        const chip = mkT(`more:${t.id}`, t.hop + 1, t.id);
        chip.clusterOf = tail;
        t.children.push(chip);
        linkedMax = Math.max(linkedMax, chip.hop);
      }
    }
    frontier = next;
  }

  // Subtree weights → proportional wedges. A chip weighs like a small subtree
  // so big folds visibly claim room.
  const weigh = (t: TNode): number => {
    t.weight = t.clusterOf
      ? 1 + Math.sqrt(t.clusterOf.length) * 0.5
      : 1 + t.children.reduce((s, c) => s + weigh(c), 0);
    return t.weight;
  };
  weigh(rootT);

  const chipEntity = (t: TNode): KnowledgeEntityView => {
    const kind = byId.get(t.clusterOf![0])?.kind ?? "entity";
    const label = `+${t.clusterOf!.length} more`;
    return { id: t.id, kind, label, naturalKeys: {}, facts: [], edges: t.clusterOf!.length, bodyMd: null, graphPin: null };
  };

  const nodes: LayerNode[] = [];
  const place = (t: TNode, a0: number, a1: number) => {
    nodes.push({
      id: t.id,
      hop: t.hop,
      angleDeg: t.hop === 0 ? 0 : (a0 + a1) / 2,
      parent: t.parent,
      entity: t.clusterOf ? chipEntity(t) : byId.get(t.id)!,
      clusterOf: t.clusterOf,
      linked: true,
    });
    const total = t.children.reduce((s, c) => s + c.weight, 0);
    const count = t.children.length;
    let a = a0;
    for (const c of t.children) {
      // Blend subtree-proportional with uniform: heavy branches get room for
      // their descendants, but leaf siblings keep ≥45% of an even share — a
      // fat subtree can't squeeze its siblings into an unreadable sliver.
      const span = (a1 - a0) * (0.55 * (c.weight / total) + 0.45 / count);
      place(c, a, a + span);
      a += span;
    }
  };
  place(rootT, -90, 270);

  // Ring-level spacing: pure wedge placement keeps children near their
  // parent, but a BUSY ring bunches inside a few parents' sectors while the
  // rest of the circle sits empty. Blend each ring's bearings toward even
  // full-circle spacing — the fuller the ring is relative to its
  // circumference (∝ hop), the stronger the blend — keeping the wedge ORDER
  // so branches never cross. Still a pure function of the graph: bearings
  // stay permanent, and the walk (which shares them) stays in sync.
  const RING_COMFORT = 9; // ring 1 holds about this many cards comfortably
  const byHop = new Map<number, LayerNode[]>();
  for (const n of nodes) {
    if (n.hop < 1) continue;
    if (!byHop.has(n.hop)) byHop.set(n.hop, []);
    byHop.get(n.hop)!.push(n);
  }
  for (const [k, ring] of byHop) {
    const t = Math.min(1, ring.length / (RING_COMFORT * k));
    if (t <= 0.35 || ring.length < 3) continue; // sparse: keep parent locality
    const ordered = [...ring].sort((a, b) => a.angleDeg - b.angleDeg || a.id.localeCompare(b.id));
    const step = 360 / ordered.length;
    // Anchor the uniform grid at the circular-mean offset so nodes move as
    // little as possible from their wedge bearing.
    let ox = 0, oy = 0;
    ordered.forEach((n, i) => {
      const d = ((n.angleDeg - i * step) * Math.PI) / 180;
      ox += Math.cos(d);
      oy += Math.sin(d);
    });
    const offset = (Math.atan2(oy, ox) * 180) / Math.PI;
    ordered.forEach((n, i) => {
      const delta = ((offset + i * step - n.angleDeg + 540) % 360) - 180;
      n.angleDeg += delta * t;
    });
  }
  // Hard floor on every ring: no two neighbours closer than HALF a uniform
  // slot. The blend above borrows the big empties; this guarantees local
  // separation even where locality kept nodes bunched. Order-preserving,
  // deterministic.
  for (const [, ring] of byHop) {
    if (ring.length < 3) continue;
    const ordered = [...ring].sort((a, b) => a.angleDeg - b.angleDeg || a.id.localeCompare(b.id));
    const g = (360 / ordered.length) * 0.5;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i].angleDeg - ordered[i - 1].angleDeg < g) ordered[i].angleDeg = ordered[i - 1].angleDeg + g;
      }
      // The seam (last → first, wrapping) needs the gap too — compress the
      // whole fan a touch when the pushes ate it.
      const span = ordered[ordered.length - 1].angleDeg - ordered[0].angleDeg;
      if (span > 360 - g) {
        const squeeze = (360 - g) / span;
        for (const n of ordered) n.angleDeg = ordered[0].angleDeg + (n.angleDeg - ordered[0].angleDeg) * squeeze;
      }
    }
  }

  // The unlinked ring: everything with no path to the center, evenly spaced.
  let maxHop = linkedMax;
  const unlinked = sortIds(entities.map((e) => e.id).filter((id) => !visited.has(id)));
  if (unlinked.length) {
    maxHop = linkedMax + 1;
    const kept = unlinked.length <= maxUnlinked + 1 ? unlinked : unlinked.slice(0, maxUnlinked);
    const tail = unlinked.length <= maxUnlinked + 1 ? [] : unlinked.slice(maxUnlinked);
    const slots = kept.length + (tail.length ? 1 : 0);
    kept.forEach((id, i) => {
      nodes.push({ id, hop: maxHop, angleDeg: -90 + (i * 360) / slots, parent: null, entity: byId.get(id)!, linked: false });
    });
    if (tail.length) {
      const kind = byId.get(tail[0])?.kind ?? "entity";
      nodes.push({
        id: "more:unlinked", hop: maxHop, angleDeg: -90 + ((slots - 1) * 360) / slots, parent: null,
        entity: { id: "more:unlinked", kind, label: `+${tail.length} more`, naturalKeys: {}, facts: [], edges: tail.length, bodyMd: null, graphPin: null },
        clusterOf: tail, linked: false,
      });
    }
  }

  // Edges: every relationship fact among kept REAL nodes (fixed endpoints →
  // an edge that leaves and comes back always comes back to the same place),
  // plus one spoke per chip so folds visibly hang off their parent.
  const kept = new Set(nodes.filter((n) => !n.clusterOf).map((n) => n.id));
  const edges: LayeredEgo["edges"] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    if (!kept.has(e.id)) continue;
    for (const f of e.facts) {
      if (!f.ref || !f.refId || f.refId === e.id || !kept.has(f.refId)) continue;
      const key = `${e.id}~${f.refId}~${f.predicate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: e.id, to: f.refId, predicate: f.predicate });
    }
  }
  for (const n of nodes) {
    if (n.clusterOf && n.parent) edges.push({ from: n.id, to: n.parent, predicate: "" });
  }

  return { center: nodes[0], nodes, edges, maxHop };
}

export const DEPTH = {
  perspective: 1250,
  centerZ: 150,
  hop1Z: 0,
  hop2Z: -230,
  /** Purely-decorative third ring: blank card silhouettes pushed deep behind
   *  hop-2 on a wider ellipse — atmosphere only, never interactive, and only
   *  in the 3D mode (the reduced-motion 2D radial drops it). */
  hop3Z: -430,
  /** hop-2 fans ± this many degrees around its parent's bearing. */
  hop2SpreadDeg: 34,
  /** Elliptical ring radii — x as a fraction of the canvas WIDTH, y of its
   *  HEIGHT (cards are wide, canvases are short; each axis fills its room). */
  r1x: 0.34,
  r1y: 0.34,
  r2x: 0.52,
  r2y: 0.46,
  r3x: 0.66,
  r3y: 0.6,
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
 * The walk's bearings, sourced from the LAYERED layout so the zoom-out is a
 * continuation, not a re-shuffle: a card at some angle in the walk stays at
 * that angle when the layers unfold. Walk-only "+N more" kind-chips (absent
 * from the layered graph) take the circular mean of their members' layered
 * bearings; chips whose members are all folded away borrow the layered chip
 * on the same parent, fanned a little apart when several need it.
 */
export function layeredAngles(layered: LayeredEgo | null, walk: EgoGraph | null): Map<string, number> {
  const m = new Map<string, number>();
  if (!layered || !walk) return m;
  for (const n of layered.nodes) if (n.hop > 0) m.set(n.id, n.angleDeg);
  const orphans: string[] = [];
  for (const n of walk.nodes) {
    if (!n.clusterOf || m.has(n.id)) continue;
    const pts = n.clusterOf
      .map((id) => m.get(id))
      .filter((a): a is number => a !== undefined)
      .map((a) => (a * Math.PI) / 180);
    const x = pts.reduce((s, a) => s + Math.cos(a), 0);
    const y = pts.reduce((s, a) => s + Math.sin(a), 0);
    if (pts.length && (x || y)) m.set(n.id, (Math.atan2(y, x) * 180) / Math.PI);
    else orphans.push(n.id);
  }
  // All members folded on the layered side too: sit by the layered chip.
  const hostChip = layered.nodes.find((c) => c.clusterOf && c.parent === walk.center.id);
  orphans.forEach((id, i) => {
    if (hostChip) m.set(id, hostChip.angleDeg + (i - (orphans.length - 1) / 2) * 16);
  });
  return m;
}

/**
 * Positions for the depth field, scaled to the canvas. Offsets are from the
 * canvas CENTER (the view translates them). Sparse hop-1 rings (1–2 nodes)
 * fan across the upper arc instead of leaving a lonely dot — per the design.
 * `angles` (id → degrees) overrides a node's bearing — the view passes
 * `layeredAngles` so the walk and the zoom-out share one bearing per node.
 */
export function depthLayout(
  graph: EgoGraph,
  width: number,
  height: number,
  reduced = false,
  angles?: ReadonlyMap<string, number>,
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
    deg = angles?.get(n.id) ?? deg;
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
      const deg = angles?.get(id) ?? baseDeg + spread;
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
