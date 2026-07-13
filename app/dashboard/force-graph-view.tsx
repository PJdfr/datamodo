"use client";

/**
 * FORCE GRAPH / MAP — the semantic-zoom constellation (design handoff
 * design/mocks/SEMANTIC_ZOOM_README.md; physics ported from
 * design/mocks/constellation.html; card styling borrowed from the walk).
 *
 * One graph where ZOOM = GRANULARITY: zoomed out → a few big clusters;
 * scroll in → a cluster whose card grows past the split threshold dissolves
 * into its children (the pure `visibleCut` decides — hysteresis, hard cap).
 * CONTINUITY RULES (user call 2026-07-13): the cluster never "disappears" —
 * its ANCHOR card takes the cluster's exact position and is PINNED there
 * while the members pop in around it and its cross-links stay; a node you
 * zoom on does not move. And the deepest zoom needs NO click: once a single
 * entity card fills enough of the screen, the map FALLS INTO the real
 * Explorer walk (inline takeover with a transition, not a modal) — clicking
 * any card dives the same way. Cards use the walk's visual language (kind
 * chip, tinted paper tones, dashed pseudo-cluster cards) so the dive reads
 * as a continuation, not a context switch.
 *
 * The force sim (repulsion ∝ card area, link springs, center gravity, hard
 * collision) runs only over the visible cut — tens of nodes, never the whole
 * world — inside a rAF loop that PUBLISHES positions to state (render never
 * reads the sim's refs). Adjacency comes from the same `buildAdjacency` the
 * walk uses. Functional but deliberately unpolished — visual refinement is a
 * design pass.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "./ui";
import { buildAdjacency } from "@/lib/datamodo/explorer";
import {
  buildConstellation, visibleCut, cutEdges, nodeSide, LOD, type ClusterNode,
} from "@/lib/datamodo/constellation";
import { buildDatasetNodes, type DatasetNodeSource } from "@/lib/datamodo/node-shapes";
import { ExplorerView } from "./explorer-view";
import { EntityPageModal } from "./entity-page";
import { buildNodeResolver } from "./markdown";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

interface Body { x: number; y: number; vx: number; vy: number }
interface Camera { x: number; y: number; scale: number }
type PosMap = Record<string, { x: number; y: number }>;

const SCALE_MIN = 0.04;
const SCALE_MAX = 8;
/** Cards are wider than tall — width/height as factors of the LOD side. */
const CARD_W = 1.5;
const CARD_H = 0.95;
/** The walk's ink-card kinds (mirrors explorer-view's TONE_BY_KIND). */
const INK_KINDS = new Set(["company", "dataset"]);

/** Deterministic per-id jitter (no Math.random — stable layouts, shootable). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10_000) / 10_000;
}

const setEquals = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

const fitScale = (r: ClusterNode) => {
  const biggest = Math.max(nodeSide(1), ...r.children.map((c) => nodeSide(c.size)));
  return Math.min(1.2, Math.max(0.08, (LOD.splitPx * 0.92) / biggest));
};

export function ForceGraphView() {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [datasetSources, setDatasetSources] = useState<DatasetNodeSource[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  // The inline Explorer takeover — set by a click OR by zooming onto a card.
  const [dive, setDive] = useState<{ id: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 0 }); // 0 = not fitted yet
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [size, setSize] = useState({ w: 960, h: 620 });
  // Published sim positions — the ONLY thing render reads for layout.
  const [pos, setPos] = useState<PosMap>({});
  // Obsidian-style force sliders (mock parity). size doubles as an LOD lens.
  const [P, setP] = useState({ center: 0.02, repel: 9000, link: 0.03, dist: 150, size: 1 });
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bodies = useRef(new Map<string, Body>());
  // Split anchors pinned at the dissolved cluster's exact spot until the sim
  // cools — "the node you zoom on does not move".
  const pins = useRef(new Map<string, { x: number; y: number }>());
  // Nodes still landing after a split/merge — everyone else is near-inert
  // while these settle, so transitions don't shake the whole graph.
  const fresh = useRef(new Set<string>());
  const prevCutIds = useRef<Set<string>>(new Set());
  const alphaRef = useRef(1);
  const diveRef = useRef<typeof dive>(null);
  const dragRef = useRef<{ id: string | null; panning: boolean; sx: number; sy: number; moved: boolean; cam: Camera }>(
    { id: null, panning: false, sx: 0, sy: 0, moved: false, cam: { x: 0, y: 0, scale: 1 } },
  );
  const autoDiveRef = useRef<string | null>(null);

  useEffect(() => { diveRef.current = dive; }, [dive]);

  /* ---- world (same fetch as the Knowledge surfaces — self-contained) ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, kres] = await Promise.all([
          fetch("/api/knowledge/entities"),
          fetch("/api/kinds").catch(() => null),
        ]);
        const json = await res.json();
        if (alive) setEntities(json.entities ?? []);
        if (alive) setDatasetSources(json.datasets ?? []);
        if (alive && kres?.ok) setKinds((await kres.json()).kinds ?? []);
      } catch { /* empty world state below */ } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const kindByName = useMemo(() => new Map(kinds.map((k) => [k.kind, k])), [kinds]);
  // Same world as the walk: entities + datasets as nodes.
  const world = useMemo(
    () => entities.concat(buildDatasetNodes(datasetSources, entities)),
    [entities, datasetSources],
  );
  const root = useMemo(() => (world.length ? buildConstellation(world) : null), [world]);
  const adj = useMemo(() => buildAdjacency(world), [world]);
  const resolveNode = useMemo(() => buildNodeResolver(world), [world]);

  /* ---- initial fit: start where the biggest cluster is JUST below split ---- */
  useEffect(() => {
    if (!root || camera.scale !== 0) return;
    const raf = requestAnimationFrame(() => setCamera({ x: 0, y: 0, scale: fitScale(root) }));
    return () => cancelAnimationFrame(raf);
  }, [root, camera.scale]);

  /* ---- the cut: which nodes exist right now (pure LOD rule) ---- */
  const lodScale = camera.scale * P.size;
  const cut = useMemo(
    () => (root && camera.scale > 0 ? visibleCut(root, lodScale, expanded) : null),
    [root, lodScale, expanded, camera.scale],
  );
  const edges = useMemo(() => (cut ? cutEdges(adj, cut.nodes) : []), [adj, cut]);
  // The canvas div only mounts once there's a cut — DOM effects key off this,
  // NOT off `loading` (the empty/loading branches render no container at all).
  const ready = !loading && cut !== null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0]?.contentRect;
      if (r && r.width > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // Sync the hysteresis state (visibleCut is a fixed point → settles in one
  // pass; deferred to a frame callback so renders never cascade).
  useEffect(() => {
    if (!cut || setEquals(cut.expanded, expanded)) return;
    const raf = requestAnimationFrame(() => setExpanded(cut.expanded));
    return () => cancelAnimationFrame(raf);
  }, [cut, expanded]);

  /* ---- the sim (ported from the mock; runs over the CUT only).
     CALM RULES (user feedback — "everything wiggles"): entering nodes are
     placed DETERMINISTICALLY on a non-overlapping ring around their origin
     (no overlap → the collision solver has nothing to explode); transitions
     reheat only a little and cool fast; while fresh nodes settle, VETERANS
     are nearly inert (forces scaled way down) so a split nudges the
     neighbourhood instead of shaking the world; velocities are capped. ---- */
  useEffect(() => {
    if (!cut) return;
    const nodes = cut.nodes;
    const sides = nodes.map((n) => nodeSide(n.size) * P.size * CARD_W); // physics on card WIDTH
    const prev = prevCutIds.current;
    const firstMount = prev.size === 0;

    // Continuity seeding. A node is "entering" when it wasn't in the last cut:
    //  · SPLIT — a dissolved cluster's ANCHOR (its id ends "/<hub>") takes the
    //    cluster's exact position and gets PINNED there; its siblings take an
    //    evenly-spaced ring around it (the walk's ego-ring, precomputed — not
    //    physics). The cluster card never "disappears" — it becomes its hub.
    //  · MERGE — a collapsing cluster appears exactly where its hub was.
    //  · a node with an old body keeps it (reappear where you were).
    //  · fresh mount — deterministic ring around the origin.
    const bs: Body[] = new Array(nodes.length);
    const ringKids = new Map<string, number[]>(); // parentId → entering sibling indices
    const centerW = new Map<string, number>(); // parentId → card width sitting at the ring center
    nodes.forEach((n, i) => {
      const b = bodies.current.get(n.id);
      const entering = !prev.has(n.id);
      const parentId = cut.parentOf[n.id];
      const hubBody = n.children.length
        ? bodies.current.get(n.hubId) ?? bodies.current.get(`${n.id}/${n.hubId}`)
        : undefined;
      if (entering && hubBody) {
        // Merge: reappear exactly where the hub last stood (old body is stale).
        bs[i] = { x: hubBody.x, y: hubBody.y, vx: 0, vy: 0 };
        pins.current.set(n.id, { x: bs[i].x, y: bs[i].y });
      } else if (b) {
        bs[i] = b;
      } else {
        const parent = bodies.current.get(parentId);
        if (parent && parentId.endsWith(`/${n.hubId}`)) {
          // Split anchor: the cluster's exact spot, pinned.
          bs[i] = { x: parent.x, y: parent.y, vx: 0, vy: 0 };
          pins.current.set(n.id, { x: bs[i].x, y: bs[i].y });
          centerW.set(parentId, sides[i]);
        } else if (parent) {
          bs[i] = { x: parent.x, y: parent.y, vx: 0, vy: 0 }; // placed below
          if (!ringKids.has(parentId)) ringKids.set(parentId, []);
          ringKids.get(parentId)!.push(i);
        } else {
          const ang = hash01(n.id) * Math.PI * 2;
          const r = 260 + 340 * hash01(`r${n.id}`);
          bs[i] = { x: Math.cos(ang) * r, y: Math.sin(ang) * r, vx: 0, vy: 0 };
        }
      }
      bodies.current.set(n.id, bs[i]);
      if (entering && !firstMount) fresh.current.add(n.id);
    });
    // Ring placement: evenly spaced, radius wide enough to clear both the
    // center card and each other — overlap-free from frame one.
    for (const [pid, idxs] of ringKids) {
      const c = bodies.current.get(pid)!; // ring center: the old cluster spot
      const cw = centerW.get(pid) ?? 0;
      const maxW = Math.max(...idxs.map((i) => sides[i]));
      const base = hash01(pid) * Math.PI * 2;
      const rr = Math.max((cw + maxW) / 2 + 30, (idxs.length * (maxW + 26)) / (2 * Math.PI));
      idxs.forEach((i, j) => {
        const ang = base + (j / idxs.length) * Math.PI * 2;
        bs[i].x = c.x + Math.cos(ang) * rr;
        bs[i].y = c.y + Math.sin(ang) * rr * 0.82; // gentle ellipse, like the walk
      });
    }
    prevCutIds.current = new Set(nodes.map((n) => n.id));
    const byId = new Map(nodes.map((n, i) => [n.id, i]));
    const decay = 0.82;
    const VMAX = 10; // world units per tick — no popping
    const VETERAN = 0.1; // force share for settled nodes while fresh ones land

    const tick = () => {
      const drag = dragRef.current.id;
      const a = Math.max(alphaRef.current, drag ? 0.3 : 0);
      const settling = fresh.current.size > 0;
      // Veterans barely feel transition forces — a split nudges, never shakes.
      const wOf = (i: number) => (settling && !fresh.current.has(nodes[i].id) ? VETERAN : 1);
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          let dx = bs[i].x - bs[j].x, dy = bs[i].y - bs[j].y, d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = hash01(nodes[i].id) - 0.5; dy = hash01(nodes[j].id) - 0.5; d2 = 0.5; }
          const d = Math.sqrt(d2);
          const f = (P.repel * (sides[i] * sides[j])) / 2500 / d2; // charge ∝ card area
          const fx = (dx / d) * f * a, fy = (dy / d) * f * a;
          bs[i].vx += fx * wOf(i); bs[i].vy += fy * wOf(i);
          bs[j].vx -= fx * wOf(j); bs[j].vy -= fy * wOf(j);
        }
      }
      for (const e of edges) {
        const ia = byId.get(e.a), ib = byId.get(e.b);
        if (ia === undefined || ib === undefined) continue;
        const A = bs[ia], B = bs[ib];
        let dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const rest = P.dist + (sides[ia] + sides[ib]) / 2;
        const f = (d - rest) * P.link * a;
        dx /= d; dy /= d;
        A.vx += dx * f * wOf(ia); A.vy += dy * f * wOf(ia);
        B.vx -= dx * f * wOf(ib); B.vy -= dy * f * wOf(ib);
      }
      for (let i = 0; i < bs.length; i++) {
        if (nodes[i].id === drag) continue;
        bs[i].vx += (0 - bs[i].x) * P.center * a * wOf(i);
        bs[i].vy += (0 - bs[i].y) * P.center * a * wOf(i);
        bs[i].vx *= decay; bs[i].vy *= decay;
        const sp = Math.hypot(bs[i].vx, bs[i].vy);
        if (sp > VMAX) { bs[i].vx *= VMAX / sp; bs[i].vy *= VMAX / sp; }
        bs[i].x += bs[i].vx; bs[i].y += bs[i].vy;
      }
      // hard collision — cards never overlap (position-based)
      for (let it = 0; it < 2; it++) {
        for (let i = 0; i < bs.length; i++) {
          for (let j = i + 1; j < bs.length; j++) {
            const dx = bs[j].x - bs[i].x, dy = bs[j].y - bs[i].y;
            const d = Math.hypot(dx, dy) || 0.01;
            const minD = (sides[i] + sides[j]) / 2 + 18;
            if (d < minD) {
              const p = (minD - d) / 2, ux = dx / d, uy = dy / d;
              if (nodes[i].id !== drag) { bs[i].x -= ux * p; bs[i].y -= uy * p; }
              if (nodes[j].id !== drag) { bs[j].x += ux * p; bs[j].y += uy * p; }
            }
          }
        }
      }
      // Pinned anchors hold their exact spot; everyone else flows around them.
      for (const [id, p] of pins.current) {
        const i = byId.get(id);
        if (i !== undefined && id !== drag) { bs[i].x = p.x; bs[i].y = p.y; bs[i].vx = 0; bs[i].vy = 0; }
      }
      alphaRef.current *= 0.96; // cool fast — a settle is ~1.5s, not a wobble
      // Release pins/damping only when motion CEASES — if they let go while
      // the sim still has energy, a full-strength coda re-shakes the layout.
      if (alphaRef.current < 0.003) { pins.current.clear(); fresh.current.clear(); }
    };
    const publish = () => {
      const snap: PosMap = {};
      nodes.forEach((n, i) => { snap[n.id] = { x: bs[i].x, y: bs[i].y }; });
      setPos(snap);
    };

    let raf = 0;
    if (reduced) {
      // Reduced motion: settle silently, paint the final state once.
      raf = requestAnimationFrame(() => {
        alphaRef.current = Math.max(alphaRef.current, 0.6);
        for (let i = 0; i < 320 && alphaRef.current > 0.003; i++) tick();
        publish();
      });
      return () => cancelAnimationFrame(raf);
    }
    const loop = () => {
      if (alphaRef.current > 0.003 || dragRef.current.id) {
        tick();
        publish();
      }
      raf = requestAnimationFrame(loop);
    };
    // Transitions get a small, local reheat — only the first layout runs hot.
    alphaRef.current = Math.max(alphaRef.current, firstMount ? 0.6 : 0.25);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cut, edges, P, reduced]);

  /* ---- camera: wheel = zoom to cursor (non-passive to beat page scroll) ---- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (diveRef.current) return; // the Explorer owns the surface now
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = ev.clientX - r.left - r.width / 2;
      const my = ev.clientY - r.top - r.height / 2;
      setCamera((c) => {
        if (c.scale === 0) return c;
        const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, c.scale * Math.exp(-ev.deltaY * 0.0014)));
        // keep the world point under the cursor fixed while scale changes
        return { x: c.x + mx / c.scale - mx / s, y: c.y + my / c.scale - my / s, scale: s };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ready]);

  /* ---- deepest zoom = the walk, NO click needed: once a single entity card
     fills the screen center past walkPx, the map falls into the Explorer ---- */
  useEffect(() => {
    if (!cut || dive) return;
    const leafW = nodeSide(1) * lodScale * CARD_W;
    const hit = leafW >= LOD.walkPx
      ? cut.nodes.find((n) => {
          if (n.children.length) return false;
          const b = pos[n.id];
          if (!b) return false;
          const sx = (b.x - camera.x) * camera.scale, sy = (b.y - camera.y) * camera.scale;
          return Math.abs(sx) < size.w * 0.28 && Math.abs(sy) < size.h * 0.28;
        })
      : undefined;
    if (hit && autoDiveRef.current !== hit.id) {
      autoDiveRef.current = hit.id; // one auto-dive per card until you pull back
      setDive({ id: hit.hubId });
    }
    if (!hit) autoDiveRef.current = null;
  }, [camera, cut, lodScale, size, dive, pos]);

  // Leaving the dive: pull the camera back a notch so the same card doesn't
  // instantly swallow the map again.
  const closeDive = () => {
    setDive(null);
    setCamera((c) => {
      const leafW = nodeSide(1) * c.scale * P.size * CARD_W;
      return leafW >= LOD.walkPx * 0.9 ? { ...c, scale: (LOD.walkPx * 0.55) / (nodeSide(1) * P.size * CARD_W) } : c;
    });
  };

  /* ---- pointer: drag a card / pan the canvas / click = dive ---- */
  const toWorld = (clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: camera.x + (clientX - r.left - r.width / 2) / camera.scale,
      y: camera.y + (clientY - r.top - r.height / 2) / camera.scale,
    };
  };
  const onPointerDown = (ev: React.PointerEvent, nodeId: string | null) => {
    if (dive) return;
    try { (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId); } catch { /* synthetic events */ }
    dragRef.current = { id: nodeId, panning: !nodeId, sx: ev.clientX, sy: ev.clientY, moved: false, cam: camera };
    if (nodeId) { pins.current.delete(nodeId); alphaRef.current = Math.max(alphaRef.current, 0.4); }
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (dive) return;
    const d = dragRef.current;
    if (!d.id && !d.panning) return;
    if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) > 4) d.moved = true;
    if (d.id) {
      const b = bodies.current.get(d.id);
      if (b) {
        const p = toWorld(ev.clientX, ev.clientY);
        b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0;
        // Reduced motion: no live loop — publish the dragged card directly.
        if (reduced) setPos((prev) => ({ ...prev, [d.id!]: { x: p.x, y: p.y } }));
      }
      alphaRef.current = Math.max(alphaRef.current, 0.4);
    } else if (d.panning && d.moved) {
      setCamera({ ...d.cam, x: d.cam.x - (ev.clientX - d.sx) / d.cam.scale, y: d.cam.y - (ev.clientY - d.sy) / d.cam.scale });
    }
  };
  const onPointerUp = () => {
    if (dive) return;
    const d = dragRef.current;
    if (d.id && !d.moved && cut) {
      const n = cut.nodes.find((x) => x.id === d.id);
      if (n) setDive({ id: n.hubId });
    }
    dragRef.current = { id: null, panning: false, sx: 0, sy: 0, moved: false, cam: camera };
  };

  /* ---- render ---- */
  if (loading) {
    return <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "40px 4px" }}>Loading your graph…</div>;
  }
  if (!root || !cut || root.size === 0) {
    return <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "40px 4px" }}>Nothing to map yet — the graph appears as your agents extract entities.</div>;
  }

  const hoverNbrs = new Set<string>();
  if (hoverId) {
    hoverNbrs.add(hoverId);
    for (const e of edges) {
      if (e.a === hoverId) hoverNbrs.add(e.b);
      if (e.b === hoverId) hoverNbrs.add(e.a);
    }
  }
  const clusters = cut.nodes.filter((n) => n.children.length).length;
  const tx = size.w / 2 - camera.x * camera.scale;
  const ty = size.h / 2 - camera.y * camera.scale;
  const px = (v: number) => v / camera.scale; // constant-screen-size in world units

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative", height: 620, background: "radial-gradient(120% 100% at 50% 42%, #FFFDF8 0%, #FBF7EF 62%, #F6F1E7 100%)",
        border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden",
        cursor: "grab", touchAction: "none",
      }}
      onPointerDown={(ev) => { if (ev.target === ev.currentTarget || (ev.target as Element).tagName === "svg") onPointerDown(ev, null); }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg width="100%" height="100%" style={{ display: "block" }} aria-label="Semantic-zoom graph — scroll to zoom, clusters split as you close in">
        <g transform={`translate(${tx}, ${ty}) scale(${camera.scale})`}>
          {edges.map((e) => {
            const a = pos[e.a], b = pos[e.b];
            if (!a || !b) return null;
            const lit = hoverId !== null && (e.a === hoverId || e.b === hoverId);
            return (
              <g key={`${e.a}~${e.b}`} style={{ pointerEvents: "none" }}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={lit ? C.accent : "#DDD5C5"}
                  strokeWidth={px(Math.min(1 + e.n * 0.35, 4.2))}
                  strokeLinecap="round"
                  opacity={hoverId && !lit ? 0.14 : 0.6}
                />
                {e.n > 1 && (lit || camera.scale > 0.5) && (
                  <text
                    x={(a.x + b.x) / 2} y={(a.y + b.y) / 2}
                    textAnchor="middle" dominantBaseline="middle" className="dm-mono"
                    fontSize={px(9.5)}
                    fill={lit ? C.accent : "#A39B8B"}
                    stroke="#FBF7EF" strokeWidth={px(3)} paintOrder="stroke"
                  >×{e.n}</text>
                )}
              </g>
            );
          })}
          {cut.nodes.map((n) => {
            const b = pos[n.id];
            if (!b) return null; // entering node — appears on the sim's next frame
            const s = nodeSide(n.size) * P.size;
            const w = s * CARD_W, h = s * CARD_H;
            const x0 = b.x - w / 2, y0 = b.y - h / 2;
            const isCluster = n.children.length > 0;
            const isOther = n.id.endsWith("/other");
            const ink = !isCluster && INK_KINDS.has(n.kind);
            const kd = kindByName.get(n.kind);
            const kindColor = kd?.color ?? "#A39B8B";
            const dim = hoverId !== null && !hoverNbrs.has(n.id);
            const hov = hoverId === n.id;
            // Walk-card tones: dashed paper for clusters (the walk's "+N more"
            // pseudo-node), ink for company/dataset, kind-tinted paper else.
            const fill = isCluster || isOther ? "#FBF8F1" : ink ? "#211E18" : `color-mix(in srgb, ${kindColor} 10%, #FFFDF8)`;
            const stroke = hov ? C.accent : isCluster || isOther ? "#C9BCA6" : ink ? "#3A352C" : `color-mix(in srgb, ${kindColor} 42%, #E7E0D2)`;
            const fg = ink ? "#F1ECE1" : "#211E18";
            const links = adj.get(n.id)?.size ?? 0;
            const sub = isOther ? `${n.size} unlinked` : isCluster ? `+${n.size - 1} more inside` : `${links} link${links === 1 ? "" : "s"}`;
            const pad = s * 0.13;
            const chipS = Math.max(4, s * 0.09);
            const kindFs = Math.max(5.5, s * 0.1);
            const labelFs = Math.min(22, Math.max(9, s * 0.19));
            const subFs = Math.max(6.5, s * 0.12);
            const maxChars = Math.max(6, Math.floor((w - pad * 2) / (labelFs * 0.56)));
            const label = n.label.length > maxChars ? n.label.slice(0, maxChars - 1) + "…" : n.label;
            const kindLabel = (isOther ? "unfiled" : kd?.label ?? n.kind).toUpperCase();
            return (
              <g
                key={n.id}
                data-map-node={n.id}
                opacity={dim ? 0.3 : 1}
                style={{ cursor: "grab", transition: "opacity .18s" }}
                onPointerEnter={() => !dragRef.current.id && setHoverId(n.id)}
                onPointerLeave={() => setHoverId((h2) => (h2 === n.id ? null : h2))}
                onPointerDown={(ev) => { ev.stopPropagation(); onPointerDown(ev, n.id); }}
              >
                <rect
                  x={x0} y={y0} width={w} height={h}
                  rx={Math.min(14, s * 0.16)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={hov ? Math.max(1.5, s * 0.02) : Math.max(1, s * 0.014)}
                  strokeDasharray={isCluster || isOther ? `${s * 0.06} ${s * 0.045}` : undefined}
                />
                {/* kind chip row — the walk card's header */}
                <rect x={x0 + pad} y={y0 + pad} width={chipS} height={chipS} rx={chipS * 0.3} fill={kindColor} />
                <text x={x0 + pad + chipS * 1.6} y={y0 + pad + chipS * 0.9} className="dm-mono"
                  fontSize={kindFs} letterSpacing="0.08em" fill={ink ? "#9C958A" : "#A39B8B"} style={{ pointerEvents: "none" }}>
                  {kindLabel}
                </text>
                {/* label + sub, left-aligned like the walk's cards */}
                <text x={x0 + pad} y={b.y + labelFs * 0.28} fontSize={labelFs} fontWeight={700}
                  fill={fg} style={{ pointerEvents: "none", letterSpacing: "-0.02em" }}>
                  {label}
                </text>
                <text x={x0 + pad} y={y0 + h - pad * 0.9} fontSize={subFs}
                  fill={fg} opacity={0.62} style={{ pointerEvents: "none" }}>
                  {sub}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* stats + fit (top-left) */}
      <div style={{ position: "absolute", top: 12, left: 14, display: "flex", alignItems: "center", gap: 8, zIndex: 5 }}>
        <span className="dm-mono" style={{ fontSize: 10.5, color: "#8A8477", background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 999, padding: "4px 11px" }}>
          {clusters} cluster{clusters === 1 ? "" : "s"} · {cut.nodes.length - clusters} card{cut.nodes.length - clusters === 1 ? "" : "s"} · {root.size} entities · {Math.round(camera.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => { setCamera({ x: 0, y: 0, scale: fitScale(root) }); setExpanded(new Set()); pins.current.clear(); fresh.current.clear(); alphaRef.current = 1; }}
          className="dm-mono"
          style={{ fontSize: 10.5, color: C.ink, background: "#FFFDF8", border: "1px solid #E1D9C8", borderRadius: 999, padding: "4px 11px", cursor: "pointer", fontFamily: "inherit" }}
        >⤢ fit</button>
      </div>

      {/* forces (top-right, mock parity — Obsidian-style sliders) */}
      <div style={{ position: "absolute", top: 12, right: 14, width: 190, background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 12, padding: "10px 12px 6px", zIndex: 5, boxShadow: "0 12px 30px -22px rgba(33,30,24,.5)" }}>
        <div className="dm-mono" style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8477", marginBottom: 7 }}>
          <span style={{ color: C.accent }}>◆</span> forces
        </div>
        {([
          ["center", 0, 100, P.center * 1000, (v: number) => ({ center: v / 1000 })],
          ["repel", 0, 100, P.repel / 200, (v: number) => ({ repel: v * 200 })],
          ["link", 0, 100, P.link * 1000, (v: number) => ({ link: v / 1000 })],
          ["dist", 30, 260, P.dist, (v: number) => ({ dist: v })],
          ["size", 60, 170, P.size * 100, (v: number) => ({ size: v / 100 })],
        ] as const).map(([label, min, max, val, set]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ flex: "0 0 44px", fontSize: 10.5, color: "#514C43" }}>{label}</span>
            <input
              type="range" min={min} max={max} value={val}
              onChange={(ev) => { setP((p) => ({ ...p, ...set(Number(ev.target.value)) })); alphaRef.current = Math.max(alphaRef.current, 0.7); }}
              style={{ flex: 1, accentColor: C.accent, height: 3 }}
            />
          </div>
        ))}
      </div>

      {/* hint (bottom) */}
      <div className="dm-mono" style={{ position: "absolute", left: 16, bottom: 12, fontSize: 10, letterSpacing: "0.05em", color: "#A39B8B", pointerEvents: "none", zIndex: 5 }}>
        scroll to zoom — clusters dissolve, and zooming onto one card drops you into its walk · click a card to walk it now
      </div>

      {/* deepest zoom / click → the REAL Explorer walk takes the surface over
          (inline, with the house drop-in transition — not a modal) */}
      {dive && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "#F6F2E9", animation: reduced ? "none" : "dm-drop-in 420ms cubic-bezier(0.16,1,0.3,1)" }}>
          <ExplorerView
            entities={world}
            initialId={dive.id}
            kindByName={kindByName}
            onOpenPage={setOpenId}
          />
          <button
            type="button"
            onClick={closeDive}
            className="dm-mono"
            style={{
              // Bottom-center: the walk's own chrome owns the top corners.
              position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", zIndex: 70,
              fontSize: 11, color: C.ink, background: "#FFFDF8", border: "1px solid #E1D9C8",
              borderRadius: 999, padding: "5px 13px", cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 8px 22px -16px rgba(33,30,24,.4)",
            }}
          >◎ Back to map</button>
        </div>
      )}
      {openId && (() => {
        const ent = world.find((e) => e.id === openId);
        return ent ? (
          <EntityPageModal
            e={ent}
            kindDef={kindByName.get(ent.kind)}
            onClose={() => setOpenId(null)}
            onOpen={setOpenId}
            resolveNode={resolveNode}
          />
        ) : null;
      })()}
    </div>
  );
}
