// CONCEPT MAP — the Obsidian-style map of content, one zoom level above the
// entity graph: only CONCEPTS are nodes. Two things connect them:
// - explicit `related_to` facts between concepts (the curated edge), and
// - CO-OCCURRENCE: two concepts that the same document/note is `about`
//   (the emergent edge, weighted by how many pieces of content they share).
// Everything is derived from the entity views the Knowledge tab already loads —
// pure projection, no new store, no imports (unit-tests under node:test).

import type { KnowledgeEntityView } from "./types";

export const CONCEPT_KIND = "concept";

/** A piece of content that is `about` a concept (document, note, message…). */
export interface ConceptItemRef {
  id: string;
  kind: string;
  label: string;
}

export interface ConceptNode {
  id: string;
  label: string;
  /** Everything that is about this concept — the node's weight and its drawer. */
  items: ConceptItemRef[];
}

export interface ConceptLink {
  /** Endpoint concept ids; a < b so each pair appears once. */
  a: string;
  b: string;
  /** Set when a `related_to`-style fact connects them directly. */
  explicit: boolean;
  /** How many pieces of content are about BOTH (0 for purely explicit links). */
  shared: number;
}

export interface ConceptMap {
  concepts: ConceptNode[];
  links: ConceptLink[];
}

/**
 * Derive the concept map from the knowledge view. Concepts sort by how much
 * content they carry (then label); links carry both signals so the renderer
 * can draw explicit edges solid and co-occurrence edges dashed.
 */
export function buildConceptMap(entities: KnowledgeEntityView[]): ConceptMap {
  const conceptIds = new Set(entities.filter((e) => e.kind === CONCEPT_KIND).map((e) => e.id));
  const items = new Map<string, ConceptItemRef[]>(); // concept id → content about it
  const links = new Map<string, ConceptLink>();

  const linkKey = (x: string, y: string) => (x < y ? `${x}~${y}` : `${y}~${x}`);
  const upsertLink = (x: string, y: string, patch: Partial<ConceptLink>) => {
    if (x === y) return;
    const key = linkKey(x, y);
    const cur = links.get(key) ?? { a: x < y ? x : y, b: x < y ? y : x, explicit: false, shared: 0 };
    links.set(key, { ...cur, explicit: cur.explicit || Boolean(patch.explicit), shared: cur.shared + (patch.shared ?? 0) });
  };

  for (const e of entities) {
    // Which concepts does this entity point at?
    const targets = [...new Set(e.facts.filter((f) => f.ref && f.refId && conceptIds.has(f.refId)).map((f) => f.refId!))]
      .filter((id) => id !== e.id);

    if (e.kind === CONCEPT_KIND) {
      // Concept → concept: the explicit edge, whatever the verb is called.
      for (const t of targets) upsertLink(e.id, t, { explicit: true });
      continue;
    }

    // Content → concepts: file the item under each, and every pair co-occurs.
    for (const t of targets) {
      if (!items.has(t)) items.set(t, []);
      items.get(t)!.push({ id: e.id, kind: e.kind, label: e.label });
    }
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) upsertLink(targets[i], targets[j], { shared: 1 });
    }
  }

  const concepts = entities
    .filter((e) => e.kind === CONCEPT_KIND)
    .map((e) => ({ id: e.id, label: e.label, items: items.get(e.id) ?? [] }))
    .sort((x, y) => y.items.length - x.items.length || x.label.localeCompare(y.label));

  return { concepts, links: [...links.values()] };
}
