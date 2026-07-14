// VAULT GRAPH — the whole-vault projection for the Data tab's Graph surface:
// EVERY entity is a node and every relationship fact is an edge. No center, no
// rings, no caps — the opposite of the Explorer's ego walk (which stands on one
// node); this feeds a renderer that can hold thousands of nodes at once
// (graphology + sigma.js in the view). Adjacency follows the ONE shared rule
// (`buildAdjacency` — if edges were computed twice they'd drift).
// Pure module (type imports + the pure explorer core only) — unit-tested.

import type { KnowledgeEntityView } from "./types";
import { buildAdjacency } from "./explorer.ts";

export interface VaultNode {
  id: string;
  label: string;
  kind: string;
  /** Distinct neighbors — drives node size in the view. */
  degree: number;
}

/** One directed relationship fact behind an edge (the inspector reads
 *  "INV-1 issued_by Acme" — direction is the fact's, subject → object). */
export interface VaultEdgeFact {
  from: string;
  to: string;
  predicate: string;
}

export interface VaultEdge {
  /** Endpoints in id order — ONE edge per unordered pair; the facts carry
   *  direction and there may be several between the same two nodes. */
  a: string;
  b: string;
  /** Every distinct (subject, object, predicate) connecting the pair. */
  facts: VaultEdgeFact[];
  /** facts.length — drives edge thickness. */
  weight: number;
}

export interface VaultGraph {
  /** Best-connected first (degree desc, then label) — deterministic. */
  nodes: VaultNode[];
  /** Ordered by (a, b) — deterministic. */
  edges: VaultEdge[];
}

/**
 * Project the vault into plain node/edge arrays. Isolated entities are KEPT
 * (the whole vault means the whole vault — the Explorer's zoom-out shows them
 * as its unlinked ring; here they're just unconnected dots). Deterministic:
 * same entities in → same arrays out, element order included.
 */
export function buildVaultGraph(entities: KnowledgeEntityView[]): VaultGraph {
  const known = new Set(entities.map((e) => e.id));
  const adjacency = buildAdjacency(entities);

  const nodes: VaultNode[] = entities
    .map((e) => ({ id: e.id, label: e.label, kind: e.kind, degree: adjacency.get(e.id)?.size ?? 0 }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  // One edge per unordered pair; facts deduped by (subject, object, predicate)
  // — the same dedup rule the ego graph uses.
  const byPair = new Map<string, VaultEdge>();
  const seen = new Set<string>();
  for (const e of entities) {
    for (const f of e.facts) {
      if (!f.ref || !f.refId || f.refId === e.id || !known.has(f.refId)) continue;
      const factKey = `${e.id}~${f.refId}~${f.predicate}`;
      if (seen.has(factKey)) continue;
      seen.add(factKey);
      const [a, b] = e.id < f.refId ? [e.id, f.refId] : [f.refId, e.id];
      const pairKey = `${a}~${b}`;
      if (!byPair.has(pairKey)) byPair.set(pairKey, { a, b, facts: [], weight: 0 });
      const edge = byPair.get(pairKey)!;
      edge.facts.push({ from: e.id, to: f.refId, predicate: f.predicate });
      edge.weight = edge.facts.length;
    }
  }
  const edges = [...byPair.values()].sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  // Facts within an edge sort too — determinism survives input shuffles.
  for (const e of edges) e.facts.sort((x, y) => x.from.localeCompare(y.from) || x.predicate.localeCompare(y.predicate) || x.to.localeCompare(y.to));

  return { nodes, edges };
}
