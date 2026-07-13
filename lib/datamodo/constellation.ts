// CONSTELLATION — the Explorer's zoomed-OUT view (semantic zoom / LOD).
// One graph where zoom = granularity: zoomed out → a few big clusters; zoom
// in → clusters dissolve into sub-clusters → individual entity cards; the
// deepest zoom hands off to the real Explorer walk (never reimplemented).
//
// Two pure, deterministic pieces (design handoff
// design/mocks/SEMANTIC_ZOOM_README.md):
//   1. buildConstellation — the cluster HIERARCHY, built once per world:
//      hub + nearest-hub (seeded label propagation), applied recursively.
//   2. visibleCut — the LOD rule, applied per camera change: the tree cut
//      where every node's on-screen size sits between merge and split
//      thresholds, with hysteresis and a hard visible-node cap.
// The force layout lives in the view (app/dashboard/force-graph-view.tsx);
// adjacency comes from the SAME buildAdjacency the walk uses — the cluster
// graph and the walk graph can never drift.
// Pure module (type imports only) — unit-tested under node:test.

import type { KnowledgeEntityView } from "./types";
// Explicit .ts extension: this pure core runs under node:test's type
// stripping too, which resolves extensionless imports nowhere.
import { buildAdjacency } from "./explorer.ts";

export interface ClusterNode {
  /** Stable across rebuilds: `${parentId}/${hubId}` (a leaf entity: its id). */
  id: string;
  /** The entity that anchors this cluster — the walk target on click. */
  hubId: string;
  label: string;
  kind: string;
  /** Entities under this node (a leaf: 1). */
  size: number;
  /** The hub's degree within its level's node set. */
  degree: number;
  /** Every entity under this node, hub first then importance-ordered. */
  memberIds: string[];
  /** Sub-clusters; [] when this is a single entity (then hubId === id). */
  children: ClusterNode[];
}

export interface ConstellationOptions {
  /** Recurse until a cluster holds at most this many members. */
  leafMax?: number;
  /** Hub count per level is adaptive but never exceeds this. */
  maxHubs?: number;
  /** A hub must have at least this degree (within the level's set). */
  minHubDegree?: number;
  /** Label-propagation sweeps per level. */
  passes?: number;
}

/**
 * Build the cluster hierarchy for the whole world. Deterministic — fixed
 * iteration order, total tie-breaks, no randomness. Returns a synthetic root
 * (never rendered) whose children are the top-level clusters.
 */
export function buildConstellation(
  entities: KnowledgeEntityView[],
  opts: ConstellationOptions = {},
): ClusterNode {
  const leafMax = opts.leafMax ?? 4;
  const maxHubs = opts.maxHubs ?? 8;
  const minHubDegree = opts.minHubDegree ?? 2;
  const passes = opts.passes ?? 3;

  const byId = new Map(entities.map((e) => [e.id, e]));
  const adj = buildAdjacency(entities);
  const weight = (a: string, b: string) => adj.get(a)?.get(b) ?? 0;

  // Degree within a subset — clustering at each level only sees its members.
  const degreesIn = (members: string[]): Map<string, number> => {
    const inSet = new Set(members);
    const deg = new Map<string, number>();
    for (const id of members) {
      let d = 0;
      for (const nb of adj.get(id)?.keys() ?? []) if (inSet.has(nb)) d++;
      deg.set(id, d);
    }
    return deg;
  };

  const leaf = (id: string, degree: number): ClusterNode => {
    const e = byId.get(id)!;
    return { id, hubId: id, label: e.label, kind: e.kind, size: 1, degree, memberIds: [id], children: [] };
  };

  // Deterministic member order everywhere: connectedness, then label, then id.
  const rankOrder = (deg: Map<string, number>) => (a: string, b: string) =>
    (deg.get(b) ?? 0) - (deg.get(a) ?? 0) ||
    (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? "") ||
    a.localeCompare(b);

  const group = (
    parentId: string,
    key: string,
    hubId: string,
    label: string,
    kind: string,
    members: string[],
    deg: Map<string, number>,
  ): ClusterNode => {
    const id = `${parentId}/${key}`;
    const ordered = [hubId, ...members.filter((m) => m !== hubId).sort(rankOrder(deg))];
    return {
      id, hubId, label, kind,
      size: members.length,
      degree: deg.get(hubId) ?? 0,
      memberIds: ordered,
      children: cluster(ordered, id),
    };
  };

  /** One level: partition `members` into clusters (or leaves at the bottom). */
  const cluster = (members: string[], parentId: string): ClusterNode[] => {
    const deg = degreesIn(members);
    const sorted = [...members].sort(rankOrder(deg));
    if (members.length <= leafMax) return sorted.map((id) => leaf(id, deg.get(id) ?? 0));

    // Hubs: top-K by degree within the set; K adapts to the set's size.
    const k = Math.max(2, Math.min(maxHubs, Math.ceil(Math.sqrt(members.length) / 1.5)));
    const hubs = sorted.filter((id) => (deg.get(id) ?? 0) >= minHubDegree).slice(0, k);

    if (hubs.length < 2) {
      // Too sparse for hub structure — fall back to group-by-kind.
      const byKind = new Map<string, string[]>();
      for (const id of sorted) {
        const kind = byId.get(id)!.kind;
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind)!.push(id);
      }
      if (byKind.size < 2) return sorted.map((id) => leaf(id, deg.get(id) ?? 0)); // one kind: nothing to split by
      return [...byKind.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([kind, ids]) =>
          ids.length === 1
            ? leaf(ids[0], deg.get(ids[0]) ?? 0)
            : group(parentId, `kind:${kind}`, ids[0], kind, kind, ids, deg),
        );
    }

    // Seeded label propagation: hubs hold their own label; everyone else takes
    // the label with the most edge weight among its neighbours, a few sweeps.
    // Ties → the higher-degree hub, then id. Gauss-Seidel (labels spread
    // within a sweep) with a fixed order keeps it deterministic.
    const isHub = new Set(hubs);
    const label = new Map<string, string>(hubs.map((h) => [h, h]));
    const inSet = new Set(members);
    for (let pass = 0; pass < passes; pass++) {
      for (const id of sorted) {
        if (isHub.has(id)) continue;
        const score = new Map<string, number>();
        for (const nb of adj.get(id)?.keys() ?? []) {
          if (!inSet.has(nb)) continue;
          const l = label.get(nb);
          if (l) score.set(l, (score.get(l) ?? 0) + weight(id, nb));
        }
        if (!score.size) continue;
        const best = [...score.entries()].sort(
          (a, b) => b[1] - a[1] || (deg.get(b[0]) ?? 0) - (deg.get(a[0]) ?? 0) || a[0].localeCompare(b[0]),
        )[0][0];
        label.set(id, best);
      }
    }

    const byHub = new Map<string, string[]>(hubs.map((h) => [h, []]));
    const unreached: string[] = [];
    for (const id of sorted) {
      const l = label.get(id);
      if (l && byHub.has(l)) byHub.get(l)!.push(id);
      else unreached.push(id);
    }

    const out: ClusterNode[] = [];
    for (const [hub, ids] of byHub) {
      if (ids.length === 1) out.push(leaf(hub, deg.get(hub) ?? 0)); // nobody joined — just the entity
      else out.push(group(parentId, hub, hub, byId.get(hub)!.label, byId.get(hub)!.kind, ids, deg));
    }
    if (unreached.length === 1) out.push(leaf(unreached[0], deg.get(unreached[0]) ?? 0));
    else if (unreached.length > 1) {
      // Nodes no hub could reach — disconnected dust, one honest bucket.
      const counts = new Map<string, number>();
      for (const id of unreached) {
        const kind = byId.get(id)!.kind;
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
      const majorityKind = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      out.push(group(parentId, "other", unreached[0], "everything else", majorityKind, unreached, deg));
    }
    return out.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
  };

  const all = entities.map((e) => e.id);
  const globalDeg = degreesIn(all);
  const topHub = [...all].sort(rankOrder(globalDeg))[0];
  return {
    id: "root",
    hubId: topHub ?? "",
    label: "your world",
    kind: "world",
    size: all.length,
    degree: topHub ? globalDeg.get(topHub) ?? 0 : 0,
    memberIds: all,
    children: cluster(all, "root"),
  };
}

// --- Semantic zoom: the visible cut ----------------------------------------

/** LOD thresholds — all in RENDERED px (world size × camera scale). */
export const LOD = {
  /** A cluster whose card renders bigger than this splits into its children. */
  splitPx: 150,
  /** An expanded cluster collapses back when its card renders below this
   *  (well under splitPx — the hysteresis band stops zoom flicker). */
  mergePx: 64,
  /** A LEAF card rendered past this = the user zoomed onto it → open the walk. */
  walkPx: 260,
  /** Hard cap on simultaneously visible nodes (the sim only ever runs over
   *  the cut — that's the whole point). */
  maxVisible: 120,
  /** Card side in world units: leaf size, plus area ∝ member count. */
  leafSide: 34,
  sideGrow: 26,
} as const;

/** Card side (world units) for a node representing `size` entities. */
export function nodeSide(size: number): number {
  return LOD.leafSide + LOD.sideGrow * Math.sqrt(Math.max(0, size - 1));
}

export interface CutOptions {
  splitPx?: number;
  mergePx?: number;
  maxVisible?: number;
}

export interface Cut {
  /** The visible nodes — a full partition of the world's entities. */
  nodes: ClusterNode[];
  /** Which cluster ids are split open (feed back in as `prevExpanded`). */
  expanded: Set<string>;
  /** Tree parent of every visible node — split/merge transitions seed from
   *  and tween back to the parent's position. */
  parentOf: Record<string, string>;
}

/**
 * The tree cut for a camera scale: expand every cluster that renders bigger
 * than splitPx; an already-open cluster stays open until it renders below
 * mergePx (hysteresis on the node's own size — a FIXED POINT: feeding the
 * returned `expanded` back with the same scale returns the same cut, so a
 * render loop can't oscillate). Expansion is biggest-first and stops at
 * maxVisible. Deterministic.
 */
export function visibleCut(
  root: ClusterNode,
  scale: number,
  prevExpanded: ReadonlySet<string> = new Set(),
  opts: CutOptions = {},
): Cut {
  const splitPx = opts.splitPx ?? LOD.splitPx;
  const mergePx = opts.mergePx ?? LOD.mergePx;
  const maxVisible = opts.maxVisible ?? LOD.maxVisible;

  const rendered = (n: ClusterNode) => nodeSide(n.size) * scale;
  const wantsOpen = (n: ClusterNode) =>
    n.children.length > 0 &&
    (rendered(n) >= splitPx || (prevExpanded.has(n.id) && rendered(n) >= mergePx));

  const expanded = new Set<string>([root.id]);
  const parentOf: Record<string, string> = {};
  const frontier: ClusterNode[] = [...root.children];
  for (const c of root.children) parentOf[c.id] = root.id;
  let visible = frontier.length;

  // Repeatedly open the LARGEST openable node the cap still allows.
  for (;;) {
    frontier.sort((a, b) => rendered(b) - rendered(a) || a.id.localeCompare(b.id));
    const i = frontier.findIndex((n) => wantsOpen(n) && visible - 1 + n.children.length <= maxVisible);
    if (i === -1) break;
    const [n] = frontier.splice(i, 1);
    expanded.add(n.id);
    visible += n.children.length - 1;
    for (const c of n.children) {
      parentOf[c.id] = n.id;
      frontier.push(c);
    }
  }
  return { nodes: frontier, expanded, parentOf };
}

// --- Edges between visible nodes --------------------------------------------

export interface CutEdge {
  /** Visible node ids (cut node ids, a<b lexicographically). */
  a: string;
  b: string;
  /** How many real entity↔entity fact-edges this line bundles. */
  n: number;
}

/**
 * Aggregate the REAL edges up to the visible cut: every underlying
 * entity↔entity edge maps to its visible representatives; edges inside one
 * cluster vanish, edges across clusters bundle with a count. Deterministic
 * (n desc, then ids).
 */
export function cutEdges(
  adjacency: Map<string, Map<string, number>>,
  cut: ClusterNode[],
): CutEdge[] {
  const rep = new Map<string, string>();
  for (const node of cut) for (const m of node.memberIds) rep.set(m, node.id);

  const agg = new Map<string, CutEdge>();
  for (const [a, nbrs] of adjacency) {
    const ra = rep.get(a);
    if (!ra) continue;
    for (const [b, w] of nbrs) {
      if (a >= b) continue; // adjacency is symmetric — visit each pair once
      const rb = rep.get(b);
      if (!rb || ra === rb) continue;
      const [x, y] = ra < rb ? [ra, rb] : [rb, ra];
      const key = `${x}~${y}`;
      const e = agg.get(key);
      if (e) e.n += w;
      else agg.set(key, { a: x, b: y, n: w });
    }
  }
  return [...agg.values()].sort((p, q) => q.n - p.n || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}
