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

/** The long tail of a ring, collapsed per kind into ONE expandable
 *  pseudo-node — "+38 more invoices" instead of 38 spokes. */
export interface EgoGroup {
  /** Stable pseudo-node id: `group:<hop>:<kind>`. */
  id: string;
  hop: 1 | 2;
  kind: string;
  count: number;
  /** Ranked like the rings — expansion reveals from the front. */
  memberIds: string[];
  /** Ring anchor: the center for hop-1 groups; for hop-2 the kept hop-1
   *  node that introduced the most members. */
  parentId: string;
  /** Fallback text ("+38 more invoices") — views with a kind registry
   *  should re-label from its plural. */
  label: string;
}

export interface EgoGraph {
  center: EgoNode;
  /** Center first, then hop 1, then hop 2 — each ring importance-ordered. */
  nodes: EgoNode[];
  edges: EgoEdge[];
  /** Neighbors that exist but didn't fit the caps (all of them live on in
   *  `groups`). */
  truncated: number;
  /** Ring overflow collapsed per (hop, kind) — biggest first. */
  groups: EgoGroup[];
  /** Who introduced each node: hop-1 → the center, hop-2 → its first hop-1
   *  neighbor (hop-1 order). Drives layout sectors AND the 3D walk's
   *  enter-from-parent animation. */
  parentOf: Record<string, string>;
}

export interface EgoOptions {
  /** Ring caps: at most this many hop-1 / hop-2 nodes. */
  maxHop1?: number;
  maxHop2?: number;
  /** Ids force-included in their ring on top of the cap — how a view expands
   *  a group: pin the next page of its memberIds and rebuild. */
  pinned?: Iterable<string>;
}

/** "invoice" → "invoices", "company" → "companies", "person" → "people". */
export function pluralizeKind(kind: string, count: number): string {
  if (count === 1) return kind;
  if (kind === "person") return "people";
  if (/[^aeiou]y$/.test(kind)) return kind.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/.test(kind)) return kind + "es";
  return kind + "s";
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
  const pinned = new Set(opts.pinned ?? []);
  // Rank-ordered keep: the cap counts only unpinned nodes, so expanding a
  // group grows the ring instead of evicting the top of it.
  const pick = (candidates: Iterable<string>, cap: number, taken: Set<string>) => {
    const list = [...candidates]
      .filter((id) => !taken.has(id))
      .sort((a, b) => rank(b) - rank(a) || (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? ""));
    const kept: string[] = [];
    const dropped: string[] = [];
    let unpinned = 0;
    for (const id of list) {
      if (pinned.has(id)) kept.push(id);
      else if (unpinned < cap) { kept.push(id); unpinned++; }
      else dropped.push(id);
    }
    return { kept, dropped };
  };

  const taken = new Set<string>([centerId]);
  const hop1 = pick(neighborIds.get(centerId) ?? [], maxHop1, taken);
  hop1.kept.forEach((id) => taken.add(id));

  const hop2Candidates = new Set<string>();
  for (const id of hop1.kept) for (const n of neighborIds.get(id) ?? []) hop2Candidates.add(n);
  const hop2 = pick(hop2Candidates, maxHop2, taken);
  hop2.kept.forEach((id) => taken.add(id));

  // Ring grouping: the dropped long tail collapses per kind into expandable
  // pseudo-nodes ("+38 more invoices"), keeping their rank order.
  const introducerOf = (id: string) =>
    hop1.kept.find((p) => neighborIds.get(id)?.has(p)) ?? hop1.kept[0];
  const groupRing = (dropped: string[], hop: 1 | 2): EgoGroup[] => {
    const byKind = new Map<string, string[]>();
    for (const id of dropped) {
      const kind = byId.get(id)?.kind ?? "thing";
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind)!.push(id);
    }
    const groups = [...byKind.entries()].map(([kind, memberIds]): EgoGroup => {
      // Anchor: hop-1 groups hang off the center; a hop-2 group sits by the
      // kept hop-1 node that introduced most of its members (ring order
      // breaks ties — deterministic).
      let parentId = centerId;
      if (hop === 2) {
        const votes = new Map<string, number>();
        for (const id of memberIds) {
          const p = introducerOf(id);
          if (p) votes.set(p, (votes.get(p) ?? 0) + 1);
        }
        parentId = hop1.kept.reduce(
          (best, p) => ((votes.get(p) ?? 0) > (votes.get(best) ?? 0) ? p : best),
          hop1.kept[0] ?? centerId,
        );
      }
      return {
        id: `group:${hop}:${kind}`,
        hop,
        kind,
        count: memberIds.length,
        memberIds,
        parentId,
        label: `+${memberIds.length} more ${pluralizeKind(kind, memberIds.length)}`,
      };
    });
    return groups.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
  };
  const groups = [...groupRing(hop1.dropped, 1), ...groupRing(hop2.dropped, 2)];

  // Introducers: hop-1 comes from the center; a hop-2 node belongs to the
  // FIRST kept hop-1 node (ring order) it neighbors — deterministic, and the
  // same rule the layout uses for sector placement.
  const parentOf: Record<string, string> = {};
  for (const id of hop1.kept) parentOf[id] = centerId;
  for (const id of hop2.kept) {
    const parent = hop1.kept.find((p) => neighborIds.get(id)?.has(p)) ?? hop1.kept[0];
    if (parent) parentOf[id] = parent;
  }

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

  return {
    center: nodes[0],
    nodes,
    edges,
    truncated: hop1.dropped.length + hop2.dropped.length,
    groups,
    parentOf,
  };
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

  const hop2 = graph.nodes.filter((n) => n.hop === 2);
  const bearing = new Map<string, number>();

  // Group pseudo-nodes are ring citizens: hop-1 groups take slots at the end
  // of the inner ring, hop-2 groups fan with their anchor's children.
  const ring1 = [
    ...graph.nodes.filter((n) => n.hop === 1).map((n) => n.id),
    ...graph.groups.filter((g) => g.hop === 1).map((g) => g.id),
  ];
  ring1.forEach((id, i) => {
    let deg: number;
    if (ring1.length === 1) deg = -90;
    else if (ring1.length === 2) deg = -140 + i * 100; // gentle upper arc
    else deg = -90 + (i * 360) / ring1.length;
    bearing.set(id, deg);
    const rad = (deg * Math.PI) / 180;
    pos[id] = {
      x: Math.cos(rad) * r1x,
      y: Math.sin(rad) * r1y,
      z: DEPTH.hop1Z,
      hop: 1, parent: graph.center.id, angleDeg: deg, ring: i,
    };
  });

  // hop-2 clusters around the bearing of the hop-1 node that introduced it.
  const kidsByParent = new Map<string, string[]>();
  const addKid = (id: string, p: string | undefined) => {
    if (!p) return;
    if (!kidsByParent.has(p)) kidsByParent.set(p, []);
    kidsByParent.get(p)!.push(id);
  };
  for (const n of hop2) addKid(n.id, graph.parentOf[n.id] ?? ring1[0]);
  for (const g of graph.groups.filter((g) => g.hop === 2)) addKid(g.id, g.parentId);
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
