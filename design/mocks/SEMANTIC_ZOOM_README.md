# Handoff — Semantic-zoom graph (LOD) for the Explorer

**Goal:** one graph where **zoom = granularity**. Zoomed out → a few big
clusters. Zoom in → clusters dissolve into sub-clusters → into individual
entity cards. Zoom onto a single card (or click it) → **the real Explorer walk**
opens on that entity. No separate modes; the deepest zoom *is* the Explorer.

```
zoom out ─────────────────────────────────────────────► zoom in
[~6 clusters] → [~20 sub-clusters] → [~80 entity cards] → [ONE card → the walk]
```

This must feel continuous, and the walk at the bottom must be **byte-for-byte our
existing Explorer** — do NOT reimplement the ego-graph. Reuse the code below.

---

## Reuse these (don't rebuild)

**Coarse renderer — start here.** [`design/mocks/constellation.html`](constellation.html)
is a working force graph: area-scaled repulsion, link springs, center gravity,
hard collision (cards never overlap), draggable **square cards with labels
below**, Obsidian-style force sliders, and a click→ego-zoom animation. Port its
physics + card styling into the React component. It's monochrome + one coral
accent, numbers in Geist Mono — keep that (brand: `design/system`).

**The real walk — this is the bottom of the zoom.**
- `app/dashboard/explorer-view.tsx` → `ExplorerView` (line 469):
  ```ts
  ExplorerView({ entities: KnowledgeEntityView[]; initialId: string;
                 kindByName: Map<string, KindDef>; onOpenPage?: (id)=>void;
                 highlightIds?: string[] })
  ```
  Focal node is internal `trail` state seeded from `initialId`; **re-center by
  remounting** (change React `key`). `goTo` is private — you don't call it.
- `lib/datamodo/explorer.ts` — the ego-graph engine: `buildEgoGraph(entities,
  center, opts)`, `depthLayout`, `DEPTH`; types `EgoNode {id,kind,label,hop,
  entity,clusterOf}`, `EgoEdge {from,to,predicate,fact,…}`, `EgoOptions
  {prefer?: Set<string>, maxPerKind, …}`. **Use this for adjacency** (see below).

**The "open the walk centered on X" opener — reuse verbatim.**
`app/dashboard/answer-graph-modal.tsx` → `AnswerGraphModal({ question, entityIds,
variant, onClose })`. It's self-contained: fetches its own world and mounts
`ExplorerView` with `initialId = present[0]`, `highlightIds = present`. To open
the walk on entity `id`:
```tsx
{walkId && <AnswerGraphModal question="" entityIds={[walkId]} variant="results"
                             onClose={() => setWalkId(null)} />}
```
That's the handoff at max zoom / click. (Alternative, more coupling: lift
`exploreId`/`exploreSeed`/`explore(id)` out of `knowledge-view.tsx` and switch
`dataView` to `"explore"` in `control-center.tsx`.)

**Data.** `GET /api/knowledge/entities` → `{ entities, datasets }`;
`GET /api/kinds` → `{ kinds }`. Walkable world =
`entities.concat(buildDatasetNodes(datasets, entities))`. Type:
`KnowledgeEntityView` (`lib/datamodo/types.ts`).

---

## Architecture — 3 parts

### 1. `lib/datamodo/constellation.ts` (NEW, pure, deterministic, no LLM, unit-tested)

Builds the **cluster hierarchy** once. Method: **hub + nearest-hub, applied
recursively.**

```ts
interface ClusterNode {
  id: string;          // stable, e.g. `${parentId}/${hubId}`
  hubId: string;       // the entity that anchors this cluster (walk target)
  label: string;       // hub's label
  kind: string;
  size: number;        // member count (this cluster incl. descendants)
  degree: number;      // hub degree
  memberIds: string[]; // all entities under this node
  children: ClusterNode[]; // sub-clusters; [] when this is a leaf entity
}
buildConstellation(entities: KnowledgeEntityView[], opts?): ClusterNode // a root
```

Per level, over a node set:
1. **degree(n)** = number of distinct neighbours. **Derive edges from the SAME
   rule the Explorer uses** — a fact with `ref && refId` is an undirected edge
   `n ↔ refId`, plus incoming (scan all). *Factor this into a shared
   `buildAdjacency(entities)` exported from `lib/datamodo/explorer.ts` and call
   it from both* so the cluster graph and the walk graph can never diverge.
2. **hubs** = top-K by degree. K adaptive: `clamp(ceil(sqrt(count)/1.5), 2, 8)`,
   and require degree ≥ 2; if <2 hubs, fall back to group-by-`kind`.
3. **assign** every non-hub to a hub by **seeded label propagation** (hubs seed
   their own label; a few deterministic passes; each node takes the
   highest-edge-weight neighbour label). Ties → higher-degree hub, then id.
   Unreached nodes → an `"other"` cluster.
4. **recurse** into each cluster's members until `size ≤ 4` → children become the
   individual entities (leaf `ClusterNode`s with `children: []`, `hubId === id`).

Deterministic (fixed iteration order, no `Math.random`). Add a
`tests/constellation.test.ts` mirroring `tests/folder-lenses.test.ts` (a small
fixture WORLD; assert hierarchy depth, hub choice, member partition, determinism).

### 2. `app/dashboard/force-graph-view.tsx` (NEW — the LOD renderer)

Port the mock's force sim + square-card rendering. It fetches the world (like
`AnswerGraphModal` does), builds the hierarchy via `buildConstellation`, and
renders a **cut** through the tree (the currently-visible nodes) with the force
layout. Nodes are real entities (leaves) or cluster super-nodes (hub-labelled,
sized by `size`). Edges between visible nodes = aggregated real edges.

### 3. Wiring

Add it as a view. Lowest-coupling: a new `DataView` `"map"` +
Segmented pill in `control-center.tsx` (`type DataView` line ~89, state line
~195, Segmented ~422), rendering `<ForceGraphView kinds={…} />`. Node/cluster
click → open `AnswerGraphModal` on the hub/entity id (part 2 above).

---

## The zoom → level-of-detail rule (the core interaction)

Drive granularity by **on-screen size**, per node — feels physical, no global
slider needed:

- Keep a camera (SVG `viewBox` or a `<g>` transform + `scale`). Scroll/pinch
  zooms toward the cursor; drag-empty-space pans.
- **Split:** a cluster whose *rendered* box (`f(size) * scale`) exceeds
  `SPLIT_PX` (~150) is replaced by its `children`. Recurse — a child that's still
  big splits again. **Merge:** siblings that all render below `MERGE_PX` (~64)
  collapse back to their parent. Hysteresis (SPLIT_PX > MERGE_PX) prevents
  flicker. The visible set is exactly the tree cut where every node's rendered
  size ∈ [MERGE_PX, SPLIT_PX].
- **Transitions:** when a cluster splits, seed its children at the parent's
  position (+ tiny jitter) and `reheat()` the sim; when merging, tween children
  back to the parent centroid. Keep it smooth (the mock's `anim()` + ease helper).
- **Bottom = the walk:** when a *leaf entity* card's rendered size exceeds
  `WALK_PX` (~260) — i.e. you've zoomed right onto it — or the user clicks any
  entity/cluster, open `AnswerGraphModal` on that `hubId`. That's the real
  Explorer; the zoom doesn't fake it, it hands off.

Optional: a "zoom slider" fallback that sets a global target-node-count N and
cuts the tree to the biggest-N clusters — more predictable, less magical. Ship
the screen-space rule; keep the slider as a toggle if it helps.

---

## Guardrails

- **Same graph everywhere:** the LOD adjacency and the walk MUST come from one
  `buildAdjacency` in `explorer.ts`. If you compute edges twice, they'll drift.
- **Deterministic clustering** — no `Math.random`; same input → same hierarchy
  (needed for stable layout and for the unit tests).
- **Performance:** the sim runs only over the *visible* cut (tens of nodes), not
  the whole graph — that's the whole point. Cap visible nodes (~120) hard.
- **Brand:** square Explorer-style cards, labels below, one coral accent, mono
  numbers, `prefers-reduced-motion` safe (base state = settled).
- **Verify** with a shoot harness (`scripts/shoot/harnesses/*.tsx` pattern,
  mocked `fetch`): screenshot zoomed-out (clusters), mid (sub-clusters), and
  assert a click opens `AnswerGraphModal` (the real `ExplorerView` mounts).

## Files
- New: `lib/datamodo/constellation.ts`, `tests/constellation.test.ts`,
  `app/dashboard/force-graph-view.tsx`, `scripts/shoot/harnesses/force-graph.tsx`.
- Edit: `lib/datamodo/explorer.ts` (export shared `buildAdjacency`),
  `app/dashboard/control-center.tsx` (new `"map"` DataView + pill).
- Reference/port: `design/mocks/constellation.html` (physics + cards),
  `app/dashboard/answer-graph-modal.tsx` (walk opener),
  `app/dashboard/explorer-view.tsx` (the walk).
- Docs: row in `docs/STATE.md`, item in `docs/ROADMAP.md`, dated line in
  `PROJECT_STATE.md` (repo rule: behavior change ⇒ docs in the same commit).
