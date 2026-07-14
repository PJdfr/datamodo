"use client";

/**
 * EXPLORER v2 — the 3D graph walk (Claude Design handoff "Datamodo Explorer
 * v2", ported onto the EXISTING pure core: buildEgoGraph/depthLayout are the
 * data contract, this file is only the skin).
 *
 * A depth-field ego-graph reading tool: the CENTER sits forward (largest,
 * sharpest), hop-1 rings the datum plane, hop-2 sits further back — smaller,
 * hazier, behind a cream fog. Click a neighbour and the world reflows around
 * a fixed camera so that node glides into the center; entering nodes fly in
 * from the parent that introduced them; leaving nodes recede and fade.
 *
 * Rendering: DOM cards in real CSS perspective (crisp text, no WebGL) + one
 * 2D SVG overlay whose edge endpoints are measured from the live projected
 * cards each frame during a settle window. Click an edge → the inspector
 * (semantics · confidence meter · since · corroboration pips · quoted
 * sources). Honors prefers-reduced-motion live: flattens to the 2D radial
 * (no perspective, no blur, no fog, ~instant transitions).
 *
 * Motion values mirror the handoff's ExplorerGraph3D.MOTION.md.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { C } from "./ui";
import { buildEgoGraph, buildLayeredEgo, depthLayout, layeredAngles, DEPTH, type DepthPos, type EgoEdge, type LayeredEgo, type LayerNode } from "@/lib/datamodo/explorer";
import { EntityPageBody } from "./entity-page";
import { buildNodeResolver } from "./markdown";
import type { FactSourceView, KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

/* ---- Motion (single source of truth — mirrors the design's MOTION.md) ---- */
const MOTION = {
  recenter: 720,
  settle: 760,
  enterDelay: 120,
  enter: 520,
  enterStagger: 42,
  exit: 300,
  edgeFade: 200,
  hover: 160,
  panel: 420,
  settleWindow: 900,
  easeOut: "cubic-bezier(0.16,1,0.3,1)",
  easeIn: "cubic-bezier(0.4,0,1,1)",
  spring: "cubic-bezier(0.34,1.32,0.5,1)",
  ease: "cubic-bezier(0.4,0,0.2,1)",
} as const;

/* Legibility caps for the depth field (the design's density; the pure core's
   defaults stay for other callers). clusterTail = ring grouping: a kind's
   long tail folds into ONE expandable "+N more" pseudo-node. */
const CAPS = { maxHop1: 6, maxHop2: 8, clusterTail: true, maxPerKind: 3 };

/* ---- Card tones ----------------------------------------------------------- */
const TONE = {
  accent:  { bg: C.accent, fg: "#FFF8F4", bd: "transparent", chip: "rgba(255,248,244,.72)" },
  ink:     { bg: "#211E18", fg: "#F1ECE1", bd: "#3A352C", chip: "#9C958A" },
  surface: { bg: "#FFFDF8", fg: "#211E18", bd: "#E7E0D2", chip: "#A39B8B" },
  sunk:    { bg: "#FAF6EE", fg: "#514C43", bd: "#E1D9C8", chip: "#A39B8B" },
} as const;
type ToneName = keyof typeof TONE;
const TONE_BY_KIND: Record<string, ToneName> = {
  company: "ink", dataset: "ink", concept: "accent", invoice: "sunk", note: "sunk",
};
const MONO_KINDS = new Set(["invoice", "dataset"]);

const CHANNEL_TINT: Record<string, string> = {
  email: "#EA4335", gmail: "#EA4335", outlook: "#0A66C2",
  whatsapp: "#25D366", slack: "#611f69", teams: "#464EB8", telegram: "#2AABEE",
};

const micro: CSSProperties = { fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#A39B8B" };

const edgeKey = (e: EgoEdge) => `${e.from}~${e.to}~${e.predicate}`;
const fmtSince = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

/* ===========================================================================
   Node card
   =========================================================================== */
function NodeCard({ e, kindDef, isCenter, isHover, cited = false, cluster = false }: {
  e: KnowledgeEntityView; kindDef?: KindDef; isCenter: boolean; isHover: boolean;
  /** This node was used to answer the user's question — coral halo + ✦ mark. */
  cited?: boolean;
  /** Ring-grouping pseudo-node ("+N more invoices") — dashed, expandable. */
  cluster?: boolean;
}) {
  // Card tone: the designed tones for the special kinds, otherwise a paper-warm
  // wash of the kind's REGISTRY color — every kind reads as its color without
  // leaving the cream world.
  const named = TONE_BY_KIND[e.kind];
  const kindColor = kindDef?.color;
  const tone = named
    ? TONE[named]
    : kindColor
    ? {
        bg: `color-mix(in srgb, ${kindColor} 10%, #FFFDF8)`,
        fg: C.ink,
        bd: `color-mix(in srgb, ${kindColor} 42%, #E7E0D2)`,
        chip: kindColor,
      }
    : TONE.surface;
  const mono = MONO_KINDS.has(e.kind);
  const sub = cluster
    ? "click to expand"
    : e.kind === "dataset"
    ? `${e.naturalKeys.rows ?? "?"} rows · ${e.naturalKeys.columns ?? "?"} cols`
    : `${e.edges} link${e.edges === 1 ? "" : "s"}`;
  const baseShadow = isCenter
    ? "0 30px 60px -28px rgba(33,30,24,.5), 0 6px 16px -8px rgba(33,30,24,.22)"
    : isHover
    ? "0 16px 34px -22px rgba(228,89,59,.5)"
    : "0 18px 44px -30px rgba(33,30,24,.4)";
  // Cited halo: a soft coral ring in FRONT of the drop shadow.
  const shadow = cited ? `0 0 0 2.5px rgba(228,89,59,.38), ${baseShadow}` : baseShadow;
  return (
    <div style={{
      background: cluster ? "#FBF8F1" : tone.bg, color: tone.fg,
      border: cluster ? `1.5px dashed ${isHover ? C.accent : "#C9BCA6"}` : `1px solid ${isHover || cited ? C.accent : tone.bd}`,
      borderRadius: isCenter ? 18 : 14,
      padding: isCenter ? "14px 16px" : "10px 12px",
      boxShadow: cluster ? "none" : shadow,
      transition: `box-shadow ${MOTION.hover}ms ${MOTION.ease}, border-color ${MOTION.hover}ms ${MOTION.ease}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        {(TONE_BY_KIND[e.kind] ?? "surface") !== "accent" && (
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 2, background: kindDef?.color ?? tone.chip, flexShrink: 0 }} />
        )}
        <span className="dm-mono" style={{ fontSize: isCenter ? 9.5 : 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: tone.chip, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {kindDef?.label ?? e.kind}
        </span>
        {cited && (
          <span title="Used to answer your question" className="dm-mono" style={{ fontSize: 9, color: C.accent, flexShrink: 0 }}>✦</span>
        )}
        {e.kind === "dataset" && (
          <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9, color: tone.chip }}>▦</span>
        )}
      </div>
      <div className={mono ? "dm-mono" : "dm-display"} style={{
        fontWeight: mono ? 500 : 700, fontSize: isCenter ? 18 : 13.5,
        letterSpacing: mono ? "0" : "-0.02em", lineHeight: 1.14, overflowWrap: "anywhere",
      }}>
        {e.label.length > 44 ? e.label.slice(0, 43) + "…" : e.label}
      </div>
      <div style={{ marginTop: 3, fontSize: isCenter ? 11.5 : 10, color: tone.fg, opacity: 0.62 }}>{sub}</div>
    </div>
  );
}

/* ===========================================================================
   A node in the depth field
   =========================================================================== */
function Node3D({ e, kindDef, pos, enterFrom, isCenter, isHover, isDim, cited, cluster, reduced, nodeRef, onEnter, onLeave, onClick }: {
  e: KnowledgeEntityView; kindDef?: KindDef; pos: DepthPos; enterFrom: DepthPos | null;
  isCenter: boolean; isHover: boolean; isDim: boolean; cited: boolean; cluster: boolean; reduced: boolean;
  nodeRef: (el: HTMLDivElement | null) => void;
  onEnter: () => void; onLeave: () => void; onClick: () => void;
}) {
  // Enter-from-parent: first paint at the parent's slot (scale .5, opacity 0),
  // then a double-rAF flip transitions to the node's own slot.
  const [settled, setSettled] = useState(!enterFrom);
  useEffect(() => {
    if (settled) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setSettled(true));
    });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only flip
  }, []);

  const entering = !settled;
  const t = entering && enterFrom ? enterFrom : pos;
  const hop = pos.hop;
  const blur = reduced ? 0 : hop === 2 ? 1.4 : 0;
  const baseOpacity = hop === 2 ? 0.9 : 1;
  const opacity = (entering ? 0 : baseOpacity) * (isDim ? 0.34 : 1);
  const w = isCenter ? 210 : hop === 1 ? 168 : 138;

  const transition = reduced
    ? "opacity 1ms, transform 1ms"
    : entering
    ? `transform ${MOTION.enter}ms ${MOTION.easeOut} ${MOTION.enterDelay + pos.ring * MOTION.enterStagger}ms, opacity ${MOTION.enter}ms ${MOTION.easeOut} ${MOTION.enterDelay}ms, filter ${MOTION.enter}ms ${MOTION.easeOut}`
    : `transform ${isCenter ? MOTION.settle : MOTION.recenter}ms ${isCenter ? MOTION.spring : MOTION.easeOut}, opacity ${MOTION.hover}ms ${MOTION.ease}, filter ${MOTION.recenter}ms ${MOTION.easeOut}`;

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      aria-label={isCenter ? `${e.label} — you are here` : cluster ? `Expand ${e.label}` : `Walk to ${e.label}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onClick}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onClick(); } }}
      style={{
        position: "absolute", left: "50%", top: "50%", width: w,
        transform: `translate(-50%,-50%) translate3d(${t.x}px, ${t.y}px, ${reduced ? 0 : t.z}px) scale(${(isHover && !isCenter ? 1.05 : 1) * (entering ? 0.5 : 1)})`,
        transformStyle: "preserve-3d",
        opacity,
        filter: blur ? `blur(${blur}px)` : "none",
        transition,
        cursor: isCenter ? "default" : "pointer",
        outline: "none",
        zIndex: isCenter ? 30 : hop === 1 ? 20 : 10,
        willChange: "transform, opacity",
      }}
    >
      <NodeCard e={e} kindDef={kindDef} isCenter={isCenter} isHover={isHover} cited={cited} cluster={cluster} />
    </div>
  );
}

/* ===========================================================================
   Ghost ring — a decorative THIRD layer of unreadable card silhouettes pushed
   deep behind hop-2. Pure atmosphere: never interactive, no edges, washed out
   by the depth fog. Deterministic (fixed spec, no randomness) and independent
   of the center, so it stays put and grounds the space as you walk. 3D only —
   the reduced-motion 2D radial drops it entirely.
   =========================================================================== */
const GHOST_SPEC = [
  { w: 118, o: 0.5, dz: 0 },
  { w: 104, o: 0.42, dz: -40 },
  { w: 122, o: 0.48, dz: 20 },
  { w: 110, o: 0.44, dz: -20 },
  { w: 116, o: 0.52, dz: 0 },
  { w: 100, o: 0.4, dz: -50 },
  { w: 126, o: 0.46, dz: 10 },
];
function GhostRing({ w, h }: { w: number; h: number }) {
  const r3x = w * DEPTH.r3x;
  const r3y = h * DEPTH.r3y;
  return (
    <>
      {GHOST_SPEC.map((g, i) => {
        // Fan evenly, phase-shifted so ghosts peek BETWEEN the outer ring's
        // bearings rather than hiding directly behind real nodes.
        const deg = -90 + 25 + (i * 360) / GHOST_SPEC.length;
        const rad = (deg * Math.PI) / 180;
        const z = DEPTH.hop3Z + g.dz;
        const blur = 2.4 + (-z - 410) / 70;
        return (
          <div key={i} aria-hidden style={{
            position: "absolute", left: "50%", top: "50%", width: g.w,
            transform: `translate(-50%,-50%) translate3d(${Math.cos(rad) * r3x}px, ${Math.sin(rad) * r3y}px, ${z}px)`,
            transformStyle: "preserve-3d",
            opacity: g.o, filter: `blur(${blur.toFixed(1)}px)`,
            pointerEvents: "none", zIndex: 3, willChange: "transform",
          }}>
            <div style={{
              background: "#FBF7EF", border: "1px solid #E2DAC9", borderRadius: 12,
              padding: "9px 11px", boxShadow: "0 16px 40px -30px rgba(33,30,24,.35)",
            }}>
              <div style={{ width: "42%", height: 5, borderRadius: 3, background: "#E5DDCB", marginBottom: 7 }} />
              <div style={{ width: "82%", height: 8, borderRadius: 3, background: "#D9CFB8", marginBottom: 5 }} />
              <div style={{ width: "60%", height: 6, borderRadius: 3, background: "#E5DDCB" }} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ===========================================================================
   Layered view — the walk's ZOOM-OUT (user decision 2026-07-13: no physics,
   no free camera). One dial: scroll out and more BFS rings appear around the
   SAME center; every node holds a permanent bearing (pure core wedge layout),
   so zoom only rescales radii and grows/shrinks cards — nothing can wiggle,
   and a node that leaves comes back to the exact same spot.
   =========================================================================== */
/** The one step animation: a ring ARRIVES from higher z (bigger + transparent
 *  → lands at size) or LIFTS back off. Everything else is a static relayout. */
export interface RingAnim { dir: "in" | "out"; ring: number; /** First reveal from the walk: spread EVERY ring from its parent, not just the newest. */ all?: boolean }

/* One card of the layered view. MEMOIZED — hovering must not re-render a
   hundred cards: the hover pop + unblur are pure CSS (:hover, zero React),
   and this component's props only change on a zoom step. */
const LayerCard = memo(function LayerCard({ n, kindDef, x, y, scale, pop, blur, op, z, isCenter, chip, trans, enterFrom, onHover, onWalk, onExpand }: {
  n: LayerNode; kindDef?: KindDef;
  x: number; y: number; scale: number; pop: number; blur: number; op: number; z: number;
  isCenter: boolean; chip: boolean; trans: string;
  /** Spread-from-parent entrance: freshly-arrived cards first paint at their
   *  parent's slot (½ scale, transparent) then glide out to their own ring —
   *  the SAME motion the base walk uses. `trans` already carries the enter
   *  timing + per-ring delay for these cards; undefined = no entrance. */
  enterFrom?: { x: number; y: number };
  onHover: (id: string | null) => void; onWalk: (id: string) => void; onExpand: (id: string) => void;
}) {
  // Enter-from-parent (the walk's own mechanism): first paint at the parent's
  // slot, then a double-rAF flip glides out to this card's own ring. `enterFrom`
  // is a memoized, stable reference while the entrance plays, so reading it in
  // render is safe; it clears to undefined once the anim settles.
  const [settled, setSettled] = useState(!enterFrom);
  useEffect(() => {
    if (settled) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSettled(true)); });
    // rAF is paused while the tab is hidden — a timer backstop guarantees the
    // card still surfaces (settled is idempotent, so whichever fires first wins).
    const fb = window.setTimeout(() => setSettled(true), 80);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); window.clearTimeout(fb); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only flip
  }, []);
  const entering = !settled && !!enterFrom;
  const tx = entering ? enterFrom!.x : x;
  const ty = entering ? enterFrom!.y : y;
  const sc = entering ? scale * 0.55 : scale;
  // A chip expands its folded members in place; a real card walks; the center
  // does neither. Chips are as clickable as any other card at every depth.
  const act = isCenter ? undefined : chip ? () => onExpand(n.id) : () => onWalk(n.id);
  return (
    <div
      className="dm-lcard"
      role={isCenter ? undefined : "button"}
      tabIndex={isCenter ? -1 : 0}
      aria-label={isCenter ? `${n.entity.label} — you are here` : chip ? `${n.entity.label} — show grouped items` : `Walk to ${n.entity.label}`}
      title={chip ? `${n.clusterOf!.length} grouped ${n.parent ? "under this branch" : "past the horizon"} — click to see them` : undefined}
      onPointerEnter={() => onHover(n.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(n.id)}
      onBlur={() => onHover(null)}
      onClick={() => act?.()}
      onKeyDown={(ev) => { if (act && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); act(); } }}
      style={{
        position: "absolute", left: "50%", top: "50%", width: isCenter ? 190 : 150,
        transform: `translate(-50%,-50%) translate(${tx}px, ${ty}px) scale(${sc})`,
        opacity: entering ? 0 : op,
        filter: blur ? `blur(${blur}px)` : undefined,
        transition: trans,
        cursor: isCenter ? "default" : "pointer",
        outline: "none",
        zIndex: z,
        ["--pop" as string]: String(pop),
      }}
    >
      <div className="dm-pop">
        <NodeCard e={n.entity} kindDef={kindDef} isCenter={isCenter} isHover={false} cluster={chip} />
      </div>
    </div>
  );
});

function LayeredView({ graph, K, anim, w, h, kindByName, hover, onHover, onWalk, onExpand, reduced }: {
  graph: LayeredEgo;
  /** DISCRETE layer count — one scroll notch = one more ring. */
  K: number;
  /** The ring that just stepped in/out — the only thing that animates. */
  anim: RingAnim | null;
  w: number; h: number;
  kindByName: Map<string, KindDef>;
  hover: string | null;
  onHover: (id: string | null) => void;
  onWalk: (id: string) => void;
  /** Expand a "+N more" chip's folded members into the panel. */
  onExpand: (id: string) => void;
  reduced: boolean;
}) {
  // EVERY layer obeys the base view's rules, relative to the CURRENT view:
  // the outermost ring is the blurred frontier (hop-2's haze — a preview of
  // what's deeper), and the HIGHLIGHTED layer is the last sharp one — the
  // ring you just revealed. Its cards are the biggest; sizes taper DOWN
  // toward the center (explored ground recedes, the reading focus is always
  // the newest ring).
  const focus = Math.max(1, K - 1);
  const ringScale = (hop: number) =>
    hop >= K ? 0.72 : Math.max(0.45, Math.pow(0.8, focus - hop));
  const blurOf = (hop: number) => (reduced || hop < K ? 0 : 1.4);
  const opOf = (hop: number) => (hop < K ? 1 : 0.9);
  // Ring radii come from the cards that SIT on them: each gap clears the two
  // neighbouring rings' card heights (the focus ring gets the room its big
  // cards need; tapered inner rings pack tight), then the whole wheel fits
  // the canvas. Radial overlap is impossible by construction; bearings stay
  // fixed, so between steps the layout is static. (+1: the just-removed ring
  // still needs a radius for its sink-out ghosts.)
  const estH = (hop: number) => (hop === 0 ? 120 : 96) * ringScale(hop);
  const radial: number[] = [0];
  for (let k = 1; k <= K + 1; k++) radial[k] = radial[k - 1] + (estH(k - 1) + estH(k)) / 2 + 16;
  const fit = Math.min(1, (h / 2 - 44) / radial[K]);
  const sxF = Math.min((w / 2 - 130) / radial[K], fit * 1.6);
  const counts = new Map<number, number>();
  for (const n of graph.nodes) counts.set(n.hop, (counts.get(n.hop) ?? 0) + 1);
  // A busy ring's cards shrink a little further so they leave each other room.
  const crowdOf = (k: number) => {
    const c = counts.get(k) ?? 1;
    return k === 0
      ? 1
      : Math.max(0.45, Math.min(1, (2 * Math.PI * radial[Math.min(k, K + 1)] * sxF) / (c * 165 * ringScale(k) * fit)));
  };
  const posOf = (n: LayerNode) => {
    const r = radial[Math.min(n.hop, K + 1)] ?? 0;
    const rad = (n.angleDeg * Math.PI) / 180;
    return { x: Math.cos(rad) * r * sxF, y: Math.sin(rad) * r * fit };
  };
  // The crowd factor must never DEFEAT the highlight: whatever the focus
  // ring's crowding costs it, every other ring is capped BELOW the realized
  // focus scale (taper inward, frontier just under) — the newest sharp ring
  // is always the biggest thing on screen.
  const rawS = (hop: number) => ringScale(hop) * crowdOf(hop);
  const focusS = rawS(focus);
  const scaleOf = (hop: number) =>
    (hop === focus ? focusS : Math.min(rawS(hop), focusS * (hop > focus ? 0.85 : Math.pow(0.82, focus - hop)))) * fit;
  const hoverPopOf = (hop: number) => Math.min(2.6, Math.max(1.06, 0.9 / scaleOf(hop)));
  const shown = graph.nodes.filter((n) => n.hop <= K);
  const shownIds = new Set(shown.map((n) => n.id));
  // The ring that just left keeps rendering as ghosts sinking back into the
  // depth (animation ends invisible + inert — no timer needed).
  const exiting = anim?.dir === "out" ? graph.nodes.filter((n) => n.hop === anim.ring) : [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  // No `filter` transition: blurred-layer transitions are expensive to
  // composite at scale — ring promotion snaps sharp, hover unblur is CSS.
  const trans = reduced ? "none" : `transform 220ms ${MOTION.easeOut}, opacity 160ms ${MOTION.ease}`;
  // Arrival = each card SPREADS from its parent's slot out to its own ring —
  // the base walk's enter-from-parent motion, applied to the zoom-out. On the
  // FIRST reveal (anim.all) every ring blooms from the center in a hop-staggered
  // cascade; on a single step-in only the newest ring spreads (inner rings just
  // glide-rescale via `trans`). Memoized so hover re-renders reuse the SAME
  // position objects → the fleet's props stay referentially stable.
  const enterMap = useMemo(() => {
    const m = new Map<string, { from: { x: number; y: number }; delay: number }>();
    if (reduced || anim?.dir !== "in") return m;
    const perHop = new Map<number, number>();
    for (const n of graph.nodes) {
      if (n.hop === 0 || n.hop > K) continue;
      if (!anim.all && n.hop !== anim.ring) continue;
      const parent = n.parent ? nodeById.get(n.parent) : null;
      const from = parent ? posOf(parent) : { x: 0, y: 0 };
      const idx = perHop.get(n.hop) ?? 0;
      perHop.set(n.hop, idx + 1);
      const delay = MOTION.enterDelay + (anim.all ? (n.hop - 1) * 80 : 0) + (idx % 10) * 16;
      m.set(n.id, { from, delay });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posOf/nodeById are pure in these deps
  }, [graph, K, anim, w, h, reduced]);
  const enterTrans = (delay: number) =>
    `transform ${MOTION.enter}ms ${MOTION.easeOut} ${delay}ms, opacity ${MOTION.enter}ms ${MOTION.easeOut} ${delay}ms`;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, background: "#F6F2E9", animation: reduced ? "none" : `dm-drop-in 260ms ${MOTION.easeOut}` }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-label="Zoomed-out layers — scroll to reveal more of your world">
        {/* keyed per step: the lines re-fade in once the cards' glide lands,
            so edges never visibly detach from moving cards */}
        <g key={K} transform={`translate(${w / 2}, ${h / 2})`}
          style={reduced ? undefined : { animation: "dm-fade-in 160ms 240ms both" }}>
          {/* edges — soft arcs that bow toward the center rather than grey
              chords cutting across the wheel. Pulling the quadratic control
              point toward the origin gives the hierarchical-edge-bundling look
              that belongs to a concentric layout: radial (cross-ring) edges
              stay near-straight, same-ring links bow gracefully through the
              middle. Deeper edges haze out like their ring. */}
          {graph.edges.map((e) => {
            if (!shownIds.has(e.from) || !shownIds.has(e.to)) return null;
            const na = nodeById.get(e.from);
            const nb = nodeById.get(e.to);
            if (!na || !nb) return null;
            const a = posOf(na), b = posOf(nb);
            const lit = hover !== null && (e.from === hover || e.to === hover);
            const depthOp = opOf(Math.max(na.hop, nb.hop)) * 0.55;
            // Control point = the chord midpoint pulled 40% toward the center,
            // so every thread curves inward along the rings.
            const cx = ((a.x + b.x) / 2) * 0.6;
            const cy = ((a.y + b.y) / 2) * 0.6;
            return (
              <path key={`${e.from}~${e.to}~${e.predicate}`}
                d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
                fill="none"
                stroke={lit ? C.accent : "#D3C6AF"} strokeWidth={lit ? 1.6 : 1} strokeLinecap="round"
                style={{ opacity: hover ? (lit ? 0.95 : 0.08) : depthOp }} />
            );
          })}
        </g>
      </svg>
      {/* ONE recursive animation vocabulary: an arriving card SPREADS from its
          parent's slot out to its ring (per-card transition, above); a leaving
          ring sinks back down (dm-sink-z). The SVG above re-fades per step (key)
          so lines never detach from the gliding cards. */}
      <style>{`
        @keyframes dm-sink-z { to { opacity: 0; transform: scale(0.55); } }
        @keyframes dm-fade-in { from { opacity: 0; } }
        .dm-lcard:hover, .dm-lcard:focus-visible { z-index: 60 !important; filter: none !important; }
        .dm-pop { transition: transform 130ms cubic-bezier(0.16,1,0.3,1); }
        .dm-lcard:hover .dm-pop, .dm-lcard:focus-visible .dm-pop { transform: scale(var(--pop, 1.1)); }
      `}</style>
      {/* the cards — the walk's own NodeCard at the walk's own depth. Each is
          a MEMOIZED LayerCard whose props only change on a zoom step, so
          hovering (CSS) and edge lighting (SVG) never re-render the fleet. */}
      {shown.map((n) => {
        const p = posOf(n);
        const isCenter = n.hop === 0;
        const en = enterMap.get(n.id);
        return (
          <LayerCard
            key={n.id}
            n={n}
            kindDef={kindByName.get(n.entity.kind)}
            x={p.x}
            y={p.y}
            scale={scaleOf(n.hop)}
            pop={hoverPopOf(n.hop)}
            blur={blurOf(n.hop)}
            op={(n.linked ? 1 : 0.85) * opOf(n.hop)}
            z={isCenter ? 45 : 44 - Math.min(n.hop, 20)}
            isCenter={isCenter}
            chip={Boolean(n.clusterOf)}
            trans={en ? enterTrans(en.delay) : trans}
            enterFrom={en?.from}
            onHover={onHover}
            onWalk={onWalk}
            onExpand={onExpand}
          />
        );
      })}
      {/* the ring that just left — ghosts sinking back into the depth */}
      {!reduced && exiting.map((n) => {
        const p = posOf(n);
        return (
          <div key={`exit-${n.id}`} aria-hidden style={{
            position: "absolute", left: "50%", top: "50%", width: 150,
            transform: `translate(-50%,-50%) translate(${p.x}px, ${p.y}px) scale(${scaleOf(n.hop)})`,
            transition: trans, pointerEvents: "none", zIndex: 43,
            filter: blurOf(n.hop) ? `blur(${blurOf(n.hop)}px)` : "none",
          }}>
            <div style={{ animation: "dm-sink-z 240ms cubic-bezier(0.4,0,1,1) forwards" }}>
              <NodeCard e={n.entity} kindDef={kindByName.get(n.entity.kind)} isCenter={false} isHover={false} cluster={Boolean(n.clusterOf)} />
            </div>
          </div>
        );
      })}
      {/* the walk's cream depth fog — distance reads as haze here too */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 47,
        background: reduced ? "none" : "radial-gradient(120% 90% at 50% 46%, rgba(246,242,233,0) 42%, rgba(246,242,233,.45) 80%, rgba(239,233,220,.75) 100%)",
      }} />
    </div>
  );
}

/* ===========================================================================
   Cluster panel — "+N more invoices" expands into its member list
   =========================================================================== */
function ClusterPanel({ node, byId, kindDef, onClose, onGoTo }: {
  node: { label: string; kind: string; clusterOf?: string[] };
  byId: Map<string, KnowledgeEntityView>;
  kindDef?: KindDef;
  onClose: () => void;
  onGoTo: (id: string) => void;
}) {
  const members = (node.clusterOf ?? []).map((id) => byId.get(id)).filter((e): e is KnowledgeEntityView => Boolean(e));
  return (
    <div role="dialog" aria-label="Cluster members" style={{
      position: "absolute", left: "50%", bottom: 20, transform: "translateX(-50%)",
      width: 400, maxWidth: "calc(100% - 40px)", maxHeight: "calc(100% - 90px)", overflow: "hidden",
      background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 18,
      boxShadow: "0 24px 60px -34px rgba(33,30,24,.5)", padding: "14px 8px 10px 16px", zIndex: 60,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, paddingRight: 8 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: kindDef?.color ?? C.accent }} />
        <span className="dm-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{node.label}</span>
        <span className="dm-mono" style={{ ...micro }}>grouped so the ring stays readable</span>
        <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#A39B8B", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ overflowY: "auto", paddingRight: 8, display: "flex", flexDirection: "column", gap: 1 }}>
        {members.map((m) => (
          <button key={m.id} type="button" onClick={() => onGoTo(m.id)} title={`Walk to ${m.label}`}
            style={{ display: "flex", alignItems: "baseline", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 8, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = "#FBF8F1"; }}
            onMouseLeave={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
            <span style={{ fontSize: 13, color: C.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{m.label}</span>
            <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", flexShrink: 0 }}>{m.edges} link{m.edges === 1 ? "" : "s"}</span>
            <span className="dm-mono" style={{ fontSize: 10, color: C.accent, flexShrink: 0 }}>walk ›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================================
   Edge overlay — one 2D SVG, endpoints measured from the live 3D projection
   =========================================================================== */
interface EdgeGeom { x1: number; y1: number; x2: number; y2: number; mx: number; my: number; op: number }

function EdgeLayer({ geom, edges, layout, hoverEdge, selEdge, focusNode, citedIds, onHover, onClick }: {
  geom: Record<string, EdgeGeom>; edges: EgoEdge[]; layout: Record<string, DepthPos>;
  hoverEdge: string | null; selEdge: string | null; focusNode: string | null;
  /** Nodes an answer cited: an edge joining two of them stays lit coral. */
  citedIds: Set<string>;
  onHover: (k: string | null) => void; onClick: (e: EgoEdge) => void;
}) {
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", zIndex: 15 }}>
      {edges.map((e) => {
        const k = edgeKey(e);
        const g = geom[k];
        if (!g) return null;
        const hop = Math.max(layout[e.from]?.hop ?? 1, layout[e.to]?.hop ?? 1);
        const active = hoverEdge === k || selEdge === k;
        const incidentFocus = Boolean(focusNode && (e.from === focusNode || e.to === focusNode));
        const cited = citedIds.has(e.from) && citedIds.has(e.to);
        const lit = active || incidentFocus || cited;
        const dim = Boolean(hoverEdge || selEdge || focusNode) && !lit;
        const showLabel = active || cited || (incidentFocus && !hoverEdge && !selEdge) || (!focusNode && !hoverEdge && !selEdge && hop <= 1);
        const dx = g.x2 - g.x1, dy = g.y2 - g.y1, len = Math.hypot(dx, dy) || 1;
        const off = Math.min(11, len * 0.4);
        return (
          <g key={k} style={{ opacity: g.op * (dim ? 0.28 : 1), transition: `opacity ${MOTION.edgeFade}ms ${MOTION.ease}` }}>
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)}
              onClick={(ev) => { ev.stopPropagation(); onClick(e); }} />
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke={lit ? C.accent : "#DDD5C5"}
              strokeWidth={active ? 2.4 : lit ? 1.9 : 1.2}
              strokeLinecap="round"
              style={{ transition: `stroke ${MOTION.hover}ms ${MOTION.ease}, stroke-width ${MOTION.hover}ms ${MOTION.ease}` }} />
            {/* direction dot just inside the object end: subject —predicate→ object */}
            <circle cx={g.x2 - (dx / len) * off} cy={g.y2 - (dy / len) * off} r={active ? 3 : 2.2}
              fill={lit ? C.accent : "#DDD5C5"} style={{ transition: `fill ${MOTION.hover}ms ${MOTION.ease}` }} />
            {showLabel && (
              <text x={g.mx} y={g.my} textAnchor="middle" dominantBaseline="middle" className="dm-mono"
                style={{ fontSize: 9.5, letterSpacing: "0.04em", fill: lit ? C.accent : "#8A8477", paintOrder: "stroke", stroke: "#F6F2E9", strokeWidth: 4, pointerEvents: "none" }}>
                {e.predicate.replace(/_/g, " ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ===========================================================================
   Edge inspector — "an edge is more than a link"
   =========================================================================== */
function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const col = value < 0.7 ? "#B08A2E" : C.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "#FAF6EE", overflow: "hidden", border: "1px solid #EFE9DC" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 999, transition: `width ${MOTION.panel}ms ${MOTION.easeOut}` }} />
      </div>
      <span className="dm-mono" style={{ fontSize: 12.5, fontWeight: 500, color: col }}>{pct}%</span>
    </div>
  );
}

function Pips({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: 2, transform: "rotate(45deg)", background: i < n ? C.accent : "#E1D9C8" }} />
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="dm-mono" style={{ ...micro, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Quote({ s }: { s: FactSourceView }) {
  const tint = CHANNEL_TINT[s.channel?.toLowerCase()] ?? C.accent;
  const quote = s.snippet ?? s.preview ?? s.subject;
  return (
    <figure style={{ margin: 0, borderLeft: `2px solid ${tint}`, paddingLeft: 11 }}>
      {quote && <blockquote style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#514C43", fontStyle: "italic" }}>“{quote}”</blockquote>}
      <figcaption className="dm-mono" style={{ marginTop: 4, display: "flex", gap: 7, alignItems: "center", fontSize: 10, color: "#A39B8B", flexWrap: "wrap" }}>
        <span style={{ color: tint, fontWeight: 500 }}>{s.channel}</span>
        {s.sender && <span>· {s.sender}</span>}
        {fmtDay(s.receivedAt) && <span>· {fmtDay(s.receivedAt)}</span>}
      </figcaption>
    </figure>
  );
}

const walkChip: CSSProperties = {
  border: "1px solid #E1D9C8", background: "#FAF6EE", borderRadius: 999, padding: "4px 11px",
  fontSize: 12.5, fontWeight: 500, color: C.ink, cursor: "pointer", fontFamily: "inherit",
};

function EdgeInspector({ edge, onClose, onGoTo }: { edge: EgoEdge; onClose: () => void; onGoTo: (id: string) => void }) {
  const f = edge.fact;
  const since = fmtSince(f.validFrom);
  const strength = f.sources >= 4 ? "Well-attested" : f.sources >= 2 ? "Corroborated" : f.sources === 1 ? "Single source" : "No source recorded";
  return (
    <div role="dialog" aria-label="Edge fact" style={{
      position: "absolute", left: "50%", bottom: 20, transform: "translateX(-50%)",
      width: 440, maxWidth: "calc(100% - 40px)", maxHeight: "calc(100% - 90px)", overflowY: "auto",
      background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 18,
      boxShadow: "0 24px 60px -34px rgba(33,30,24,.5)", padding: "16px 18px 18px", zIndex: 60,
      // NOTE: the drop-in animation cannot live here — it animates `transform`
      // and would clobber the translateX centering. It rides an inner div.
    }}>
      <div style={{ animation: `dm-drop-in ${MOTION.panel}ms ${MOTION.easeOut}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
        <span className="dm-mono" style={{ ...micro, color: C.accent }}>fact</span>
        <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>edge · not just a link</span>
        <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#A39B8B", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => onGoTo(edge.from)} style={walkChip}>{edge.fromLabel}</button>
        <span className="dm-mono" style={{ fontSize: 11.5, color: C.accent, letterSpacing: "0.02em" }}>{edge.predicate.replace(/_/g, " ")} →</span>
        <button onClick={() => onGoTo(edge.to)} style={walkChip}>{edge.toLabel}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "13px 20px" }}>
        <Field label="Confidence"><ConfidenceMeter value={f.confidence ?? 1} /></Field>
        <Field label="Since"><span style={{ fontSize: 13, color: "#514C43" }}>{since ?? "—"}</span></Field>
        <Field label={`Corroboration · ${f.sources}×`}><Pips n={Math.min(5, f.sources)} /></Field>
        <Field label="Strength"><span style={{ fontSize: 13, color: "#514C43" }}>{strength}</span></Field>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #EFE9DC" }}>
        <div className="dm-mono" style={{ ...micro, marginBottom: 9 }}>
          {f.provenance.length ? `Quoted from ${f.provenance.length} source${f.provenance.length === 1 ? "" : "s"}` : "Evidence — none recorded"}
        </div>
        <div style={{ display: "grid", gap: 9, maxHeight: 150, overflowY: "auto" }}>
          {f.provenance.map((s, i) => <Quote key={i} s={s} />)}
        </div>
      </div>
      </div>
    </div>
  );
}

/* ===========================================================================
   ExplorerView — the orchestrator (same public contract as v1)
   =========================================================================== */
export function ExplorerView({ entities, initialId, kindByName, onOpenPage, highlightIds }: {
  entities: KnowledgeEntityView[];
  initialId: string;
  kindByName: Map<string, KindDef>;
  /** Open the full page modal for a node. */
  onOpenPage?: (id: string) => void;
  /** Nodes used to answer a question (search → "see in graph"): they get a
   *  coral halo, win ring slots, edges between them stay lit, and a floating
   *  chip row walks between them. */
  highlightIds?: string[];
}) {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  const [trail, setTrail] = useState<string[]>([initialId]);
  const center = trail[trail.length - 1];
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  // The expanded "+N more" pseudo-node (its member list shows in a panel).
  const [selCluster, setSelCluster] = useState<string | null>(null);
  const [jump, setJump] = useState("");
  const [geom, setGeom] = useState<Record<string, EdgeGeom>>({});
  const [size, setSize] = useState({ w: 640, h: 560 });
  const [leaving, setLeaving] = useState<{ id: string; e: KnowledgeEntityView; last: DepthPos }[]>([]);
  // The zoom-out: null = the walk; an INTEGER = how many rings are out.
  // One scroll notch = one ring — discrete steps, one animation each.
  const [layers, setLayers] = useState<number | null>(null);
  const [ringAnim, setRingAnim] = useState<RingAnim | null>(null);
  const [layerHover, setLayerHover] = useState<string | null>(null);
  const wheelAcc = useRef(0);
  const lastStep = useRef(0);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeEls = useRef(new Map<string, HTMLDivElement>());
  const settleUntil = useRef(0);

  // Live reduced-motion preference (listener callbacks are async).
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Canvas size drives the pure layout's radii.
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  // Body [[wikilinks]] in the side panel resolve against the whole world.
  const resolveNode = useMemo(() => buildNodeResolver(entities), [entities]);
  const citedSet = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);
  const graph = useMemo(
    () => buildEgoGraph(entities, center, citedSet.size ? { ...CAPS, prefer: citedSet } : CAPS),
    [entities, center, citedSet],
  );
  // The zoom-out layers: same center, whole world, fixed bearings.
  const layeredGraph = useMemo(() => buildLayeredEgo(entities, center), [entities, center]);
  // ONE bearing per node, shared by the walk and the zoom-out — a card keeps
  // its angle when the layers unfold.
  const sharedAngles = useMemo(() => layeredAngles(layeredGraph, graph), [layeredGraph, graph]);
  const layout = useMemo(
    () => (graph ? depthLayout(graph, size.w, size.h, reduced, sharedAngles) : {}),
    [graph, size.w, size.h, reduced, sharedAngles],
  );

  // Entering nodes are computed at walk time (the event handler knows both the
  // old and the new neighborhood) — never from refs during render.
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());

  // Once a spread-in entrance has played, drop the anim back to null so the
  // layered fleet's props go referentially stable again (a lingering "in" anim
  // would re-hand every entering card a fresh enterFrom on each hover render).
  useEffect(() => {
    if (ringAnim?.dir !== "in") return;
    const spread = ringAnim.all ? Math.max(1, layeredGraph?.maxHop ?? 3) : 1;
    const dur = MOTION.enter + MOTION.enterDelay + spread * 80 + 260;
    const t = window.setTimeout(() => setRingAnim((a) => (a === ringAnim ? null : a)), dur);
    return () => window.clearTimeout(t);
  }, [ringAnim, layeredGraph]);

  /* ---- the zoom stepper: scroll enough → ONE more ring falls in; scroll
     back → it lifts off (below the walk's 2 hops → the walk itself). The
     layout between steps is static — one recursive animation per step. ---- */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      if (!layeredGraph) return;
      // ALWAYS accumulate — events during the per-step spacing are banked,
      // not discarded, so a continuous scroll steps at a steady cadence
      // instead of demanding a fresh notch after every pause.
      wheelAcc.current += ev.deltaY;
      const now = performance.now();
      if (now - lastStep.current < 120) return; // brief spacing between steps
      const NOTCH = 85; // accumulated deltaY per step
      const maxHop = layeredGraph.maxHop;
      const entry = Math.min(3, Math.max(2, maxHop)); // first step past the walk
      if (wheelAcc.current > NOTCH) {
        wheelAcc.current = 0;
        // Nothing beyond the walk's 2 hops and nothing unlinked → no zoom-out.
        if (layers === null && maxHop < 3 && !layeredGraph.nodes.some((n) => !n.linked)) return;
        const next = layers === null ? entry : Math.min(maxHop, layers + 1);
        if (next === layers) return;
        setSelEdge(null); setSelCluster(null); setHoverEdge(null); setHoverNode(null);
        setLayers(next);
        // First reveal from the walk (layers null) → bloom EVERY ring from the
        // center; a subsequent step only spreads the newly-arrived ring.
        setRingAnim({ dir: "in", ring: next, all: layers === null });
        lastStep.current = now;
      } else if (wheelAcc.current < -NOTCH) {
        wheelAcc.current = 0;
        if (layers === null) return;
        if (layers <= entry) {
          setLayers(null); setRingAnim(null); setLayerHover(null);
        } else {
          setLayers(layers - 1);
          setRingAnim({ dir: "out", ring: layers });
        }
        lastStep.current = now;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [layeredGraph, layers]);

  /* ---- edge geometry: measure the live projected node centers ---- */
  const measure = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !graph) return;
    const sr = scene.getBoundingClientRect();
    const centerPt = (id: string) => {
      const el = nodeEls.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top, hw: r.width / 2, hh: r.height / 2 };
    };
    type Pt = { x: number; y: number; hw: number; hh: number };
    // Where the segment toward `o` exits `c`'s card rectangle (+pad) — lines
    // attach at the card border, never the center.
    const borderPoint = (c: Pt, o: Pt, pad: number) => {
      const dx = o.x - c.x, dy = o.y - c.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < 0.001 && ady < 0.001) return { x: c.x, y: c.y };
      const t = Math.min(adx > 0.001 ? (c.hw + pad) / adx : Infinity, ady > 0.001 ? (c.hh + pad) / ady : Infinity);
      return { x: c.x + dx * t, y: c.y + dy * t };
    };
    const g: Record<string, EdgeGeom> = {};
    for (const e of graph.edges) {
      const a = centerPt(e.from), b = centerPt(e.to);
      if (!a || !b) continue;
      const hop = Math.max(layout[e.from]?.hop ?? 1, layout[e.to]?.hop ?? 1);
      const pa = borderPoint(a, b, 2), pb = borderPoint(b, a, 2);
      g[edgeKey(e)] = { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, mx: (pa.x + pb.x) / 2, my: (pa.y + pb.y) / 2, op: hop === 2 ? 0.5 : hop === 1 ? 0.85 : 1 };
    }
    setGeom(g);
  }, [graph, layout]);

  // rAF loop while a transition settles (setGeom happens inside rAF callbacks).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      measure();
      if (performance.now() < settleUntil.current) raf = requestAnimationFrame(tick);
    };
    settleUntil.current = performance.now() + MOTION.settleWindow;
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [measure]);

  useEffect(() => {
    const on = () => { settleUntil.current = performance.now() + 120; requestAnimationFrame(measure); };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [measure]);

  // The walk's scene unmounts while zoomed out (no point reconciling a hidden
  // 3D world under the layers) — re-measure its edge geometry on return.
  useEffect(() => {
    if (layers !== null) return;
    settleUntil.current = performance.now() + 200;
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [layers, measure]);

  /* ---- the walk ---- */
  // Diff old vs new neighborhood at the moment of the walk: who leaves gets a
  // receding snapshot, who arrives flies in from its parent. Then bump the
  // settle window so the edge overlay tracks the whole glide.
  const walkTo = (id: string, nextTrail: (t: string[]) => string[]) => {
    if (id === center || !byId.has(id) || !graph) return;
    // Zoomed out? Clicking a card RE-CENTERS the layered view on it but keeps
    // the zoom level you were at (user decision 2026-07-14: recenter in place,
    // don't snap back to the fully-zoomed-in walk). The new center's world may
    // be shallower, so clamp the ring count to what it can show.
    if (layers !== null) {
      const nextLayered = buildLayeredEgo(entities, id);
      const nextK = nextLayered ? Math.min(layers, Math.max(2, nextLayered.maxHop)) : layers;
      setSelEdge(null);
      setSelCluster(null);
      setHoverEdge(null);
      setHoverNode(null);
      setJump("");
      setLayerHover(null);
      setLayers(nextK);
      // Bloom every ring out from the NEW center — the same reveal the first
      // zoom-out uses, so the recenter reads as a reflow, not a reset.
      setRingAnim({ dir: "in", ring: nextK, all: true });
      setTrail(nextTrail);
      return;
    }
    const next = buildEgoGraph(entities, id, CAPS);
    if (next) {
      const staying = new Set(next.nodes.map((n) => n.id));
      const current = new Set(graph.nodes.map((n) => n.id));
      const gone = graph.nodes
        .filter((n) => !staying.has(n.id) && layout[n.id])
        .map((n) => ({ id: n.id, e: n.entity, last: layout[n.id] }));
      setLeaving(gone);
      window.setTimeout(() => setLeaving([]), MOTION.exit + 60);
      gone.forEach((s) => nodeEls.current.delete(s.id));
      setEnteringIds(new Set(next.nodes.map((n) => n.id).filter((nid) => !current.has(nid))));
    }
    // (The measure-loop effect re-arms the settle window when the graph flips.)
    setSelEdge(null);
    setSelCluster(null);
    setHoverEdge(null);
    setHoverNode(null);
    setJump("");
    setLayers(null); // walking always lands you back in the walk
    setRingAnim(null);
    setLayerHover(null);
    setTrail(nextTrail);
  };
  const goTo = (id: string) =>
    walkTo(id, (t) => (t.includes(id) ? t.slice(0, t.indexOf(id) + 1) : [...t, id].slice(-14)));
  // Stable identity for the memoized LayerCards — goTo itself closes over
  // fresh state every render, so route through a ref.
  const goToRef = useRef(goTo);
  useEffect(() => { goToRef.current = goTo; });
  const layerWalk = useCallback((id: string) => goToRef.current(id), []);
  // Expanding a folded "+N more" chip from the zoom-out view — toggle its
  // member panel. Stable identity so the memoized LayerCards don't churn.
  const layerExpand = useCallback((id: string) => {
    setSelCluster((prev) => (prev === id ? null : id));
    setSelEdge(null);
  }, []);
  const back = () => {
    const prev = trail[trail.length - 2];
    if (prev) walkTo(prev, (t) => t.slice(0, -1));
  };
  const goIndex = (i: number) => walkTo(trail[i], (t) => t.slice(0, i + 1));

  const jumpMatches = useMemo(() => {
    const q = jump.trim().toLowerCase();
    if (!q) return [];
    return entities
      .filter((e) => e.id !== center && e.label.toLowerCase().includes(q))
      .sort((a, b) => b.edges - a.edges)
      .slice(0, 6);
  }, [jump, entities, center]);

  if (!graph) {
    return <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "28px 4px" }}>That node isn&apos;t in your knowledge yet.</div>;
  }
  const centerEntity = byId.get(center)!;
  const selectedEdge = selEdge ? graph.edges.find((e) => edgeKey(e) === selEdge) ?? null : null;
  // The chip lives in whichever graph is on screen: the walk's ego graph, or
  // the zoom-out's layered graph. Both node shapes carry `.entity` + `.clusterOf`.
  const clusterPool: Array<{ id: string; clusterOf?: string[]; entity: KnowledgeEntityView }> =
    layers === null ? graph.nodes : layeredGraph?.nodes ?? [];
  const selectedCluster = selCluster ? clusterPool.find((n) => n.id === selCluster && n.clusterOf) ?? null : null;

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: 620, background: "#F6F2E9", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
      {/* ---- CANVAS ---- */}
      <div ref={canvasRef} style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden" }}>
        {/* the depth field */}
        <div
          ref={sceneRef}
          onClick={(e) => { if (e.target === e.currentTarget) setSelEdge(null); }}
          style={{ position: "absolute", inset: 0, perspective: reduced ? "none" : `${DEPTH.perspective}px`, perspectiveOrigin: "50% 46%" }}
        >
          {/* the walk's whole 3D world unmounts while the layers cover it —
              a hidden hundred-element scene must not tax every hover render.
              (Edge geometry re-measures on return; positions are unchanged.) */}
          {layers === null && <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
            {/* decorative third layer — deep, unreadable card silhouettes */}
            {!reduced && <GhostRing w={size.w} h={size.h} />}

            <EdgeLayer geom={geom} edges={graph.edges} layout={layout}
              hoverEdge={hoverEdge} selEdge={selEdge} focusNode={hoverNode} citedIds={citedSet}
              onHover={setHoverEdge}
              onClick={(e) => {
                // A cluster's spoke has a synthetic fact — expand the members
                // instead of opening the fact inspector.
                const cn = graph.nodes.find((n) => n.clusterOf && (n.id === e.from || n.id === e.to));
                if (cn) { setSelCluster(cn.id); setSelEdge(null); }
                else setSelEdge(edgeKey(e));
              }} />

            {graph.nodes.map((n) => {
              const p = layout[n.id];
              if (!p) return null;
              const isCenter = n.hop === 0;
              const entering = enteringIds.has(n.id) && !isCenter;
              const parentPos = p.parent ? layout[p.parent] ?? p : p;
              const isDim = Boolean(
                hoverNode && hoverNode !== n.id &&
                !graph.edges.some((e) => (e.from === hoverNode && e.to === n.id) || (e.to === hoverNode && e.from === n.id)),
              );
              return (
                <Node3D
                  key={`${center}~${n.id}`}
                  e={n.entity}
                  kindDef={kindByName.get(n.kind)}
                  pos={p}
                  enterFrom={entering && !reduced ? parentPos : null}
                  isCenter={isCenter}
                  isHover={hoverNode === n.id}
                  isDim={isDim}
                  cited={citedSet.has(n.id)}
                  cluster={Boolean(n.clusterOf)}
                  reduced={reduced}
                  nodeRef={(el) => { if (el) nodeEls.current.set(n.id, el); }}
                  onEnter={() => setHoverNode(n.id)}
                  onLeave={() => setHoverNode(null)}
                  onClick={() => {
                    if (isCenter) return;
                    if (n.clusterOf) { setSelCluster(selCluster === n.id ? null : n.id); setSelEdge(null); }
                    else goTo(n.id);
                  }}
                />
              );
            })}

            {/* leaving nodes — recede + fade (decorative snapshots) */}
            {leaving.map(({ id, e, last }) => (
              <div key={`leave-${id}`} aria-hidden style={{
                position: "absolute", left: "50%", top: "50%", width: 160,
                transform: `translate(-50%,-50%) translate3d(${last.x}px, ${last.y}px, ${(reduced ? 0 : last.z) - 160}px) scale(0.6)`,
                opacity: 0,
                transition: `transform ${MOTION.exit}ms ${MOTION.easeIn}, opacity ${MOTION.exit}ms ${MOTION.easeIn}`,
                zIndex: 4, pointerEvents: "none",
              }}>
                <NodeCard e={e} kindDef={kindByName.get(e.kind)} isCenter={false} isHover={false} />
              </div>
            ))}

            {/* truncation chip — the rings are importance-capped */}
            {graph.truncated > 0 && (() => {
              const rad = (28 * Math.PI) / 180;
              const rx = size.w * DEPTH.r1x + 46;
              const ry = size.h * DEPTH.r1y + 46;
              return (
                <div title={`${graph.truncated} more neighbour${graph.truncated === 1 ? "" : "s"} beyond the rings — capped by importance`}
                  className="dm-mono"
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    transform: `translate(-50%,-50%) translate3d(${Math.cos(rad) * rx}px, ${Math.sin(rad) * ry}px, 0px)`,
                    transition: reduced ? "none" : `transform ${MOTION.recenter}ms ${MOTION.easeOut}`,
                    display: "flex", alignItems: "center", padding: "5px 10px",
                    background: "#F6F2E9", border: "1px dashed #DDD5C5", borderRadius: 999,
                    color: "#A39B8B", fontSize: 10, letterSpacing: "0.05em", cursor: "default", zIndex: 5,
                  }}>
                  +{graph.truncated} more
                </div>
              );
            })()}
          </div>}
        </div>

        {/* cream depth fog — distance reads as haze, not just scale */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 8,
          background: reduced ? "none" : "radial-gradient(120% 90% at 50% 42%, rgba(246,242,233,0) 40%, rgba(246,242,233,.55) 78%, rgba(239,233,220,.85) 100%)",
        }} />

        {/* zoomed out: the layers view covers the walk (z 40, under the chrome) */}
        {layers !== null && layeredGraph && (
          <LayeredView
            graph={layeredGraph}
            K={layers}
            anim={ringAnim}
            w={size.w}
            h={size.h}
            kindByName={kindByName}
            hover={layerHover}
            onHover={setLayerHover}
            onWalk={layerWalk}
            onExpand={layerExpand}
            reduced={reduced}
          />
        )}

        {/* breadcrumb + back (floating) */}
        <div style={{ position: "absolute", top: 14, left: 16, display: "flex", alignItems: "center", gap: 8, zIndex: 50, maxWidth: "62%" }}>
          <button onClick={back} disabled={trail.length < 2} aria-label="Back"
            style={{
              display: "flex", alignItems: "center", gap: 5, border: "1px solid #E7E0D2", background: "#FFFDF8",
              borderRadius: 999, padding: "5px 11px 5px 9px", fontSize: 12, fontFamily: "inherit",
              color: trail.length < 2 ? "#A39B8B" : "#514C43",
              cursor: trail.length < 2 ? "default" : "pointer", opacity: trail.length < 2 ? 0.5 : 1,
              boxShadow: "0 8px 22px -16px rgba(33,30,24,.4)",
            }}>
            ← Back
          </button>
          {trail.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 999, padding: "4px 11px", boxShadow: "0 8px 22px -16px rgba(33,30,24,.4)", overflow: "hidden" }}>
              {trail.slice(-4).map((id, i, shown) => {
                const idx = trail.length - shown.length + i;
                const last = i === shown.length - 1;
                return (
                  <span key={`${id}${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {i > 0 && <span style={{ color: "#A39B8B", fontSize: 10.5 }}>/</span>}
                    <button onClick={() => !last && goIndex(idx)} disabled={last}
                      style={{
                        border: "none", background: "transparent", padding: "1px 3px", fontFamily: "inherit",
                        cursor: last ? "default" : "pointer", fontSize: 12, fontWeight: last ? 600 : 400,
                        whiteSpace: "nowrap", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis",
                        color: last ? C.accent : "#514C43",
                      }}>{byId.get(id)?.label ?? "?"}</button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* cited nodes (floating, under the breadcrumb): the nodes the answer
            used — click one to walk straight to it and read it in the panel */}
        {citedSet.size > 0 && (
          <div style={{ position: "absolute", top: 52, left: 16, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", zIndex: 50, maxWidth: "62%" }}>
            <span className="dm-mono" style={{ ...micro, color: C.accent, background: "#FFFDF8", border: "1px solid #F3D6CB", borderRadius: 999, padding: "4px 9px" }}>✦ used in the answer</span>
            {[...citedSet].filter((id) => byId.has(id)).map((id) => {
              const isHere = id === center;
              return (
                <button key={id} type="button" onClick={() => goTo(id)} disabled={isHere}
                  title={isHere ? "You are here" : `Walk to ${byId.get(id)!.label}`}
                  style={{
                    border: `1px solid ${isHere ? C.accent : "#F3D6CB"}`, background: isHere ? C.accent : "#FFFDF8",
                    color: isHere ? "#FFF8F4" : C.ink, borderRadius: 999, padding: "4px 11px",
                    fontSize: 11.5, fontWeight: 500, cursor: isHere ? "default" : "pointer", fontFamily: "inherit",
                    maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    boxShadow: "0 8px 22px -16px rgba(33,30,24,.4)",
                  }}>
                  {byId.get(id)!.label}
                </button>
              );
            })}
          </div>
        )}

        {/* jump box (floating, top-right) */}
        <div style={{ position: "absolute", top: 14, right: 16, zIndex: 50, width: 210 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 11 }}>⌕</span>
          <input value={jump} onChange={(e) => setJump(e.target.value)} placeholder="Jump to anything…"
            style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 999, padding: "6px 10px 6px 25px", fontFamily: "inherit", fontSize: 12, color: C.ink, background: "#FFFDF8", outline: "none", boxSizing: "border-box", boxShadow: "0 8px 22px -16px rgba(33,30,24,.4)" }} />
          {jumpMatches.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, boxShadow: "0 12px 28px rgba(33,30,24,.14)", overflow: "hidden" }}>
              {jumpMatches.map((m) => (
                <button key={m.id} type="button" onClick={() => goTo(m.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: kindByName.get(m.kind)?.color ?? "#DDD5C5", flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                  <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9, color: "#B7AF9F", textTransform: "uppercase" }}>{m.kind}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* hints */}
        <div className="dm-mono" style={{ position: "absolute", left: 18, bottom: 13, ...micro, zIndex: 50, opacity: 0.8, pointerEvents: "none" }}>
          {layers !== null
            ? "scroll in to return to the walk · click a card to walk to it"
            : "click to walk · click an edge for its fact · scroll out to zoom"}
        </div>
        <div className="dm-mono" style={{ position: "absolute", right: 18, bottom: 13, ...micro, zIndex: 50, opacity: 0.7, pointerEvents: "none" }}>
          {layers !== null && layeredGraph
            ? `${layers} of ${Math.max(2, layeredGraph.maxHop)} layers · ${layeredGraph.nodes.length} nodes`
            : `${reduced ? "2D radial · reduced motion" : "ego neighbourhood"} · ${graph.nodes.length} nodes · ${graph.edges.length} edges`}
        </div>

        {selectedEdge && layers === null && (
          <EdgeInspector edge={selectedEdge} onClose={() => setSelEdge(null)} onGoTo={(id) => { setSelEdge(null); goTo(id); }} />
        )}
        {/* The panel works from either surface — the walk or the zoom-out. */}
        {selectedCluster && (
          <ClusterPanel
            node={{ label: selectedCluster.entity.label, kind: selectedCluster.entity.kind, clusterOf: selectedCluster.clusterOf }}
            byId={byId}
            kindDef={kindByName.get(selectedCluster.entity.kind)}
            onClose={() => setSelCluster(null)}
            onGoTo={(id) => { setSelCluster(null); goTo(id); }}
          />
        )}
      </div>

      {/* ---- SIDE PANEL: the current node in its natural shape ---- */}
      <aside style={{ width: 320, flexShrink: 0, borderLeft: "1px solid #EFE9DC", background: "#FCFAF4", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 13px", borderBottom: "1px solid #EFE9DC" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <span className="dm-mono" style={{ ...micro, color: kindByName.get(centerEntity.kind)?.color ?? C.accent }}>
              {kindByName.get(centerEntity.kind)?.label ?? centerEntity.kind}
            </span>
            {onOpenPage && (
              <button type="button" onClick={() => onOpenPage(center)} className="dm-mono"
                style={{ marginLeft: "auto", fontSize: 10.5, color: C.ink, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}>
                Full page ›
              </button>
            )}
          </div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 21, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.1 }}>{centerEntity.label}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: "#8A8477" }}>
            {centerEntity.edges} connection{centerEntity.edges === 1 ? "" : "s"}{centerEntity.facts.filter((f) => !f.ref).length > 0 ? ` · ${centerEntity.facts.filter((f) => !f.ref).length} fact${centerEntity.facts.filter((f) => !f.ref).length === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div key={center} style={{ flex: 1, overflowY: "auto", padding: "16px 18px 20px", animation: reduced ? "none" : `dm-drop-in ${MOTION.panel}ms ${MOTION.easeOut}` }}>
          <EntityPageBody e={centerEntity} kindDef={kindByName.get(centerEntity.kind)} onOpen={goTo} resolveNode={resolveNode} variant="flat" />
        </div>
      </aside>
    </div>
  );
}
