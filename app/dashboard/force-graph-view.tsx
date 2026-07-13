"use client";

/**
 * FORCE GRAPH / MAP — the semantic-zoom constellation (design handoff
 * design/mocks/SEMANTIC_ZOOM_README.md; physics + card styling ported from
 * design/mocks/constellation.html).
 *
 * One graph where ZOOM = GRANULARITY: zoomed out → a few big clusters;
 * scroll in → clusters whose card grows past the split threshold dissolve
 * into their children (the pure `visibleCut` decides — hysteresis, hard cap);
 * zoom right onto a single entity card — or click any card — and the REAL
 * Explorer walk opens on it (`AnswerGraphModal`; never reimplemented).
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
import { AnswerGraphModal } from "./answer-graph-modal";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

interface Body { x: number; y: number; vx: number; vy: number }
interface Camera { x: number; y: number; scale: number }
type PosMap = Record<string, { x: number; y: number }>;

const SCALE_MIN = 0.04;
const SCALE_MAX = 10;

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
  const [walkId, setWalkId] = useState<string | null>(null);
  const [walkLabel, setWalkLabel] = useState("");
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
  const alphaRef = useRef(1);
  const dragRef = useRef<{ id: string | null; panning: boolean; sx: number; sy: number; moved: boolean; cam: Camera }>(
    { id: null, panning: false, sx: 0, sy: 0, moved: false, cam: { x: 0, y: 0, scale: 1 } },
  );
  const autoWalkRef = useRef<string | null>(null);

  /* ---- world (same fetch as AnswerGraphModal — self-contained) ---- */
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
    const raf = requestAnimationFrame(() => {
      setExpanded(cut.expanded);
      alphaRef.current = Math.max(alphaRef.current, 0.8); // reheat on split/merge
    });
    return () => cancelAnimationFrame(raf);
  }, [cut, expanded]);

  /* ---- the sim (ported from the mock; runs over the CUT only) ---- */
  useEffect(() => {
    if (!cut) return;
    const nodes = cut.nodes;
    const sides = nodes.map((n) => nodeSide(n.size) * P.size);
    // Positions persist across cuts; entering nodes seed at their tree parent.
    const bs = nodes.map((n, i) => {
      let b = bodies.current.get(n.id);
      if (!b) {
        const parent = bodies.current.get(cut.parentOf[n.id]);
        const ang = hash01(n.id) * Math.PI * 2;
        const spread = parent ? sides[i] : 260 + 340 * hash01(`r${n.id}`);
        b = { x: (parent?.x ?? 0) + Math.cos(ang) * spread, y: (parent?.y ?? 0) + Math.sin(ang) * spread, vx: 0, vy: 0 };
        bodies.current.set(n.id, b);
      }
      return b;
    });
    const byId = new Map(nodes.map((n, i) => [n.id, i]));
    const decay = 0.82;

    const tick = () => {
      const drag = dragRef.current.id;
      const a = Math.max(alphaRef.current, drag ? 0.35 : 0);
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          let dx = bs[i].x - bs[j].x, dy = bs[i].y - bs[j].y, d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = hash01(nodes[i].id) - 0.5; dy = hash01(nodes[j].id) - 0.5; d2 = 0.5; }
          const d = Math.sqrt(d2);
          const f = (P.repel * (sides[i] * sides[j])) / 2500 / d2; // charge ∝ card area
          const fx = (dx / d) * f * a, fy = (dy / d) * f * a;
          bs[i].vx += fx; bs[i].vy += fy; bs[j].vx -= fx; bs[j].vy -= fy;
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
        A.vx += dx * f; A.vy += dy * f; B.vx -= dx * f; B.vy -= dy * f;
      }
      for (let i = 0; i < bs.length; i++) {
        if (nodes[i].id === drag) continue;
        bs[i].vx += (0 - bs[i].x) * P.center * a;
        bs[i].vy += (0 - bs[i].y) * P.center * a;
        bs[i].vx *= decay; bs[i].vy *= decay;
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
      alphaRef.current *= 0.985;
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
        alphaRef.current = Math.max(alphaRef.current, 0.8);
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
    alphaRef.current = Math.max(alphaRef.current, 0.6);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cut, edges, P, reduced]);

  /* ---- camera: wheel = zoom to cursor (non-passive to beat page scroll) ---- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
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

  /* ---- deepest zoom = the walk: a LEAF card past walkPx opens the Explorer ---- */
  useEffect(() => {
    if (!cut || walkId) return;
    const hit = cut.nodes.find((n) => {
      if (n.children.length || nodeSide(1) * lodScale < LOD.walkPx) return false;
      const b = pos[n.id];
      if (!b) return false;
      const sx = (b.x - camera.x) * camera.scale, sy = (b.y - camera.y) * camera.scale;
      return Math.abs(sx) < size.w * 0.3 && Math.abs(sy) < size.h * 0.3;
    });
    if (hit && autoWalkRef.current !== hit.id) {
      autoWalkRef.current = hit.id; // one auto-open per card until you leave it
      setWalkId(hit.hubId);
      setWalkLabel(hit.label);
    }
    if (!hit) autoWalkRef.current = null;
  }, [camera, cut, lodScale, size, walkId, pos]);

  /* ---- pointer: drag a card / pan the canvas / click = walk ---- */
  const toWorld = (clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: camera.x + (clientX - r.left - r.width / 2) / camera.scale,
      y: camera.y + (clientY - r.top - r.height / 2) / camera.scale,
    };
  };
  const onPointerDown = (ev: React.PointerEvent, nodeId: string | null) => {
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    dragRef.current = { id: nodeId, panning: !nodeId, sx: ev.clientX, sy: ev.clientY, moved: false, cam: camera };
    if (nodeId) alphaRef.current = Math.max(alphaRef.current, 0.4);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
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
    const d = dragRef.current;
    if (d.id && !d.moved && cut) {
      const n = cut.nodes.find((x) => x.id === d.id);
      if (n) { setWalkId(n.hubId); setWalkLabel(n.label); }
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
  const sideOf = (n: ClusterNode) => nodeSide(n.size) * P.size;

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
                  stroke={lit ? C.accent : "#CDBFA6"}
                  strokeWidth={px(Math.min(1 + e.n * 0.35, 4.2))}
                  strokeLinecap="round"
                  opacity={hoverId && !lit ? 0.14 : 0.55}
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
            const s = sideOf(n);
            const isCluster = n.children.length > 0;
            const isOther = n.id.endsWith("/other");
            const kd = kindByName.get(n.kind);
            const dim = hoverId !== null && !hoverNbrs.has(n.id);
            const hov = hoverId === n.id;
            const label = n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label;
            return (
              <g
                key={n.id}
                opacity={dim ? 0.3 : 1}
                style={{ cursor: "grab", transition: "opacity .18s" }}
                onPointerEnter={() => !dragRef.current.id && setHoverId(n.id)}
                onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                onPointerDown={(ev) => { ev.stopPropagation(); onPointerDown(ev, n.id); }}
              >
                <rect
                  x={b.x - s / 2} y={b.y - s / 2} width={s} height={s}
                  rx={isCluster ? 11 : 7}
                  fill={isOther ? "#FBF8F1" : isCluster ? "#211E18" : "#FFFDF8"}
                  stroke={hov ? C.accent : isOther ? "#C9BCA6" : isCluster ? "#3A352C" : "#E1D9C8"}
                  strokeWidth={px(hov ? 2.2 : 1.5)}
                  strokeDasharray={isOther ? `${px(5)} ${px(4)}` : undefined}
                />
                {/* kind chip — the registry color, top-left like the walk's cards */}
                <rect x={b.x - s / 2 + s * 0.1} y={b.y - s / 2 + s * 0.1} width={Math.min(7, s * 0.12)} height={Math.min(7, s * 0.12)} rx={2} fill={kd?.color ?? (isCluster ? "#9C958A" : C.accent)} />
                {isCluster ? (
                  <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="middle" className="dm-mono"
                    fontSize={Math.max(12, s * 0.24)} fill={isOther ? "#8A8477" : "#F1ECE1"} style={{ pointerEvents: "none" }}>
                    {n.size}
                  </text>
                ) : (
                  <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="middle"
                    fontSize={13} fill={kd?.color ?? C.accent} style={{ pointerEvents: "none" }}>
                    {n.kind === "dataset" ? "▦" : n.kind === "document" ? "▤" : "●"}
                  </text>
                )}
                {/* label below, constant screen size — readable at every zoom */}
                <text x={b.x} y={b.y + s / 2 + px(15)} textAnchor="middle"
                  fontSize={px(isCluster ? 12 : 10.5)} fontWeight={isCluster ? 700 : 600} fill={isCluster ? "#1E1B16" : "#514C43"}
                  stroke="#FBF7EF" strokeWidth={px(3)} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                  {label}
                </text>
                {isCluster && (
                  <text x={b.x} y={b.y + s / 2 + px(28)} textAnchor="middle" className="dm-mono"
                    fontSize={px(9)} fill="#A39B8B" style={{ pointerEvents: "none" }}>
                    {isOther ? `${n.size} unlinked` : `${kd?.label ?? n.kind} · ${n.size} inside`}
                  </text>
                )}
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
          onClick={() => { setCamera({ x: 0, y: 0, scale: fitScale(root) }); setExpanded(new Set()); alphaRef.current = 1; }}
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
        scroll to zoom — clusters dissolve as you close in · drag a card to push the graph around · click a card to walk it
      </div>

      {/* deepest zoom / click → the REAL Explorer walk */}
      {walkId && (
        <AnswerGraphModal
          question={walkLabel}
          entityIds={[walkId]}
          variant="results"
          onClose={() => setWalkId(null)}
        />
      )}
    </div>
  );
}
