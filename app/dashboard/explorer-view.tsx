"use client";

/**
 * EXPLORER — ONE continuous view, no modes (user call 2026-07-20; merges the
 * former 3D walk and the layered zoom-out, which used to swap below 2 rings).
 *
 * The whole reachable world is concentric BFS rings around the center
 * (buildLayeredEgo — fixed bearings, per-parent "+N more" folding, a dashed
 * unlinked outer ring). `zoom` is a CONTINUOUS ring count (≥ 2) that HOLDS
 * wherever you stop: floor(zoom) rings are landed, the fraction emerges the
 * next ring from the center with its edges drawing outward. Depth is a
 * dimension of the SAME wheel (continuousLayout): at zoom 2 — the walk, the
 * front door — the center card sits forward, ring 1 rides the datum plane and
 * the frontier hangs back small + blurred behind the cream fog; pulling out
 * flattens the depth field continuously toward the flat wheel. One
 * representation from fully-zoomed-in to fully-out.
 *
 * Rendering: DOM cards in real CSS perspective (crisp text, no WebGL) + one
 * 2D SVG whose edge endpoints are the perspective projection of the SAME pure
 * positions (projectDepth) — no DOM measuring, so cards and edges travel
 * together on every zoom frame. Click a card → recenter IN PLACE at the same
 * zoom (new cards spread from their parents, staying cards glide). Click an
 * edge → the fact inspector (semantics · confidence · since · corroboration ·
 * quoted sources) at every zoom level; NO predicate labels are drawn on edges.
 * Honors prefers-reduced-motion live: flat wheel, no blur, ~instant moves.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { C } from "./ui";
import { buildLayeredEgo, continuousLayout, projectDepth, DEPTH, type ContinuousPos, type EgoEdge, type LayeredEgo, type LayerNode } from "@/lib/datamodo/explorer";
import { EntityPageBody } from "./entity-page";
import { buildNodeResolver } from "./markdown";
import type { FactSourceView, KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

/* ---- Motion (single source of truth) ---- */
const MOTION = {
  recenter: 720,
  enterDelay: 120,
  enter: 520,
  hover: 160,
  panel: 420,
  edgeFade: 200,
  easeOut: "cubic-bezier(0.16,1,0.3,1)",
  ease: "cubic-bezier(0.4,0,0.2,1)",
} as const;

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
  /** Ring-grouping pseudo-node ("+N more") — dashed, expandable. */
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
   Ghost ring — decorative card silhouettes pushed deep behind the frontier.
   Pure atmosphere: never interactive, no edges, washed out by the depth fog.
   Deterministic (fixed spec, no randomness) and independent of the center, so
   it stays put and grounds the space as you walk. It belongs to walk depth:
   `fade` (1 at zoom 2 → 0 by ~2.8) dissolves it as real rings take the room.
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
function GhostRing({ w, h, fade }: { w: number; h: number; fade: number }) {
  const r3x = w * DEPTH.r3x;
  const r3y = h * DEPTH.r3y;
  return (
    <>
      {GHOST_SPEC.map((g, i) => {
        // Fan evenly, phase-shifted so ghosts peek BETWEEN the frontier's
        // bearings rather than hiding directly behind real nodes.
        const deg = -90 + 25 + (i * 360) / GHOST_SPEC.length;
        const rad = (deg * Math.PI) / 180;
        const z = DEPTH.hop3Z + g.dz;
        const blur = 2.4 + (-z - 410) / 70;
        return (
          <div key={i} aria-hidden style={{
            position: "absolute", left: "50%", top: "50%", width: g.w,
            transform: `translate(-50%,-50%) translate3d(${Math.cos(rad) * r3x}px, ${Math.sin(rad) * r3y}px, ${z}px)`,
            opacity: g.o * fade, filter: `blur(${blur.toFixed(1)}px)`,
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
   One card of the wheel. MEMOIZED — hovering must not re-render the fleet:
   only the hovered card's props change (the pop itself is pure CSS), and zoom
   frames change only the position props.
   =========================================================================== */
const Card = memo(function Card({ n, kindDef, pos, zi, hovered, cited, chip, trans, enterFrom, onHover, onWalk, onExpand }: {
  n: LayerNode; kindDef?: KindDef; pos: ContinuousPos; zi: number;
  hovered: boolean; cited: boolean; chip: boolean; trans: string;
  /** Enter-from-parent: a freshly-arrived card first paints at its parent's
   *  slot (½ scale, transparent) then glides out to its own ring — `trans`
   *  already carries the enter timing + stagger for these cards. */
  enterFrom?: { x: number; y: number; z: number };
  onHover: (id: string | null) => void; onWalk: (id: string) => void; onExpand: (id: string) => void;
}) {
  const isCenter = pos.hop === 0;
  // Enter-from-parent: first paint at the parent's slot, then a double-rAF
  // flip glides out to this card's own ring. `enterFrom` is a stable memoized
  // reference while the entrance plays; it clears once the anim settles.
  const [settled, setSettled] = useState(!enterFrom);
  useEffect(() => {
    if (settled) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSettled(true)); });
    // rAF is paused while the tab is hidden — a timer backstop guarantees the
    // card still surfaces (settled is idempotent; whichever fires first wins).
    const fb = window.setTimeout(() => setSettled(true), 80);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); window.clearTimeout(fb); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only flip
  }, []);
  const entering = !settled && !!enterFrom;
  const t = entering ? enterFrom! : pos;
  const sc = entering ? pos.scale * 0.55 : pos.scale;
  // A chip expands its folded members in place; a real card walks; the center
  // does neither. Chips are as clickable as any other card at every depth.
  const act = isCenter ? undefined : chip ? () => onExpand(n.id) : () => onWalk(n.id);
  const pop = Math.min(2.6, Math.max(1.06, 0.9 / Math.max(0.05, pos.scale)));
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
        transform: `translate(-50%,-50%) translate3d(${t.x}px, ${t.y}px, ${t.z}px) scale(${sc})`,
        opacity: entering ? 0 : pos.op * (n.linked ? 1 : 0.85),
        // Hover unblurs a frontier card so it can be read in place.
        filter: pos.blur && !hovered ? `blur(${pos.blur.toFixed(2)}px)` : undefined,
        transition: trans,
        cursor: isCenter ? "default" : "pointer",
        outline: "none",
        zIndex: hovered ? 60 : zi,
        willChange: "transform, opacity",
        ["--pop" as string]: String(pop),
      }}
    >
      <div className="dm-pop">
        <NodeCard e={n.entity} kindDef={kindDef} isCenter={isCenter} isHover={hovered && !isCenter} cited={cited} cluster={chip} />
      </div>
    </div>
  );
});

/* ===========================================================================
   Cluster panel — "+N more" expands into its member list
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
   ExplorerView — the orchestrator (same public contract as v1/v2)
   =========================================================================== */

/** Entrance choreography for a recenter: card id → where it flies in from
 *  (its parent's slot) and its stagger delay. Built ONCE per recenter so the
 *  memoized fleet's props stay referentially stable while it plays. */
type Entrance = Map<string, { from: { x: number; y: number; z: number }; delay: number }>;

function mkEntrance(
  g: LayeredEgo,
  lay: Map<string, ContinuousPos>,
  enterIds: Set<string> | null,
  reduced: boolean,
): Entrance {
  const m: Entrance = new Map();
  if (reduced) return m;
  const perHop = new Map<number, number>();
  for (const n of g.nodes) {
    if (n.hop === 0 || !lay.has(n.id)) continue;
    if (enterIds && !enterIds.has(n.id)) continue;
    const p = (n.parent ? lay.get(n.parent) : null) ?? lay.get(g.center.id);
    if (!p) continue;
    const idx = perHop.get(n.hop) ?? 0;
    perHop.set(n.hop, idx + 1);
    // Hop-staggered cascade: each ring blooms just after the one inside it.
    m.set(n.id, { from: { x: p.x, y: p.y, z: p.z }, delay: MOTION.enterDelay + (n.hop - 1) * 80 + (idx % 10) * 16 });
  }
  return m;
}

export function ExplorerView({ entities, initialId, kindByName, onOpenPage, highlightIds }: {
  entities: KnowledgeEntityView[];
  initialId: string;
  kindByName: Map<string, KindDef>;
  /** Open the full page modal for a node. */
  onOpenPage?: (id: string) => void;
  /** Nodes used to answer a question (search → "see in graph"): they get a
   *  coral halo, never fold into "+N more" chips, edges between them stay lit,
   *  and a floating chip row walks between them. */
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
  const [size, setSize] = useState({ w: 640, h: 560 });
  // The ONE dial: a continuous ring count ≥ 2 that HOLDS wherever you stop.
  // 2 = the walk (front door); scrolling out reveals ring after ring.
  const [zoom, setZoom] = useState(2);

  const citedSet = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);
  const layeredOpts = useMemo(() => (citedSet.size ? { prefer: citedSet } : {}), [citedSet]);

  // Recenter choreography (also plays on first paint: the world blooms out of
  // the center). null while scrolling — the zoom loop drives motion directly.
  const [anim, setAnim] = useState<Entrance | null>(() => {
    const g = buildLayeredEgo(entities, initialId, citedSet.size ? { prefer: citedSet } : {});
    return g ? mkEntrance(g, continuousLayout(g, 2, 640, 560, reduced), null, reduced) : null;
  });

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Continuous-zoom animator: the wheel feeds a TARGET; a rAF loop eases the
  // DISPLAYED zoom toward it each frame, so cards and edges travel together
  // and the emerging ring's edges visibly draw outward.
  const zoomTarget = useRef(2);
  const zoomDisp = useRef(2);
  const zoomRaf = useRef(0);

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
  const graph = useMemo(() => buildLayeredEgo(entities, center, layeredOpts), [entities, center, layeredOpts]);
  const maxZoom = Math.max(2, graph?.maxHop ?? 2);
  const layout = useMemo(
    () => (graph ? continuousLayout(graph, zoom, size.w, size.h, reduced) : new Map<string, ContinuousPos>()),
    [graph, zoom, size.w, size.h, reduced],
  );

  /* ---- the zoom dial ---- */
  const animateZoomRef = useRef<() => void>(() => {});
  const animateZoom = useCallback(() => {
    const tv = zoomTarget.current;
    let nv = zoomDisp.current + (tv - zoomDisp.current) * 0.2; // ~exp ease, ~300ms @60fps
    if (Math.abs(tv - nv) < 0.012) nv = tv;
    zoomDisp.current = nv;
    setZoom(nv);
    zoomRaf.current = nv === tv ? 0 : requestAnimationFrame(() => animateZoomRef.current());
  }, []);
  useEffect(() => { animateZoomRef.current = animateZoom; }, [animateZoom]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const SENS = 1 / 300; // deltaY → zoom units (~one ring per 300px)
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const nz = Math.min(maxZoom, Math.max(2, zoomTarget.current + ev.deltaY * SENS));
      if (nz === zoomTarget.current) return;
      zoomTarget.current = nz;
      setAnim(null); // scrolling cancels any entrance choreography
      if (!zoomRaf.current) zoomRaf.current = requestAnimationFrame(() => animateZoomRef.current());
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (zoomRaf.current) { cancelAnimationFrame(zoomRaf.current); zoomRaf.current = 0; }
    };
  }, [maxZoom]);

  // A shallower world (recenter/refresh) clamps the dial to what it can show.
  useEffect(() => {
    if (zoomTarget.current > maxZoom) {
      zoomTarget.current = maxZoom;
      if (!zoomRaf.current) zoomRaf.current = requestAnimationFrame(() => animateZoomRef.current());
    }
  }, [maxZoom]);

  // Drop the entrance choreography once it has played, so the fleet's props go
  // referentially stable again (a lingering entrance would re-hand every card
  // a fresh enterFrom on each hover render).
  useEffect(() => {
    if (!anim) return;
    const rings = Math.max(1, Math.min(Math.round(zoomDisp.current), graph?.maxHop ?? 2));
    const dur = MOTION.enterDelay + MOTION.enter + rings * 80 + 300;
    const t = window.setTimeout(() => setAnim((a) => (a === anim ? null : a)), dur);
    return () => window.clearTimeout(t);
  }, [anim, graph]);

  /* ---- the walk (recenter IN PLACE, at every zoom) ---- */
  const walkTo = (id: string, nextTrail: (t: string[]) => string[]) => {
    if (id === center || !byId.has(id) || !graph) return;
    const nextG = buildLayeredEgo(entities, id, layeredOpts);
    if (!nextG) return;
    // Land on a settled INTEGER ring count at the current depth, clamped to
    // what the new center's world can show (zoom is a property of the view,
    // not reset by navigation — user call 2026-07-14).
    const nextK = Math.min(Math.max(2, Math.round(zoomDisp.current)), Math.max(2, nextG.maxHop));
    if (zoomRaf.current) { cancelAnimationFrame(zoomRaf.current); zoomRaf.current = 0; }
    zoomTarget.current = nextK;
    zoomDisp.current = nextK;
    setZoom(nextK);
    // The walk's motion vocabulary at every zoom: cards NEW to the world
    // spread from their parent's slot; staying cards glide to their new ring.
    const current = new Set(graph.nodes.map((n) => n.id));
    const entering = new Set(nextG.nodes.map((n) => n.id).filter((nid) => !current.has(nid)));
    setAnim(mkEntrance(nextG, continuousLayout(nextG, nextK, size.w, size.h, reduced), entering, reduced));
    setSelEdge(null);
    setSelCluster(null);
    setHoverEdge(null);
    setHoverNode(null);
    setJump("");
    setTrail(nextTrail);
  };
  const goTo = (id: string) =>
    walkTo(id, (t) => (t.includes(id) ? t.slice(0, t.indexOf(id) + 1) : [...t, id].slice(-14)));
  // Stable identity for the memoized Cards — goTo itself closes over fresh
  // state every render, so route through a ref.
  const goToRef = useRef(goTo);
  useEffect(() => { goToRef.current = goTo; });
  const cardWalk = useCallback((id: string) => goToRef.current(id), []);
  const cardHover = useCallback((id: string | null) => setHoverNode(id), []);
  // Expanding a folded "+N more" chip — toggle its member panel.
  const cardExpand = useCallback((id: string) => {
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
  // A layered edge is the light {from,to,predicate} shape (no fact); rebuild
  // the full EgoEdge from the subject's facts so the fact inspector opens at
  // every zoom level. Cluster spokes (predicate "") have no real fact → null,
  // and are routed to expand instead of inspect.
  const layeredEdgeToEgo = (le: { from: string; to: string; predicate: string }): EgoEdge | null => {
    const from = byId.get(le.from), to = byId.get(le.to);
    if (!from || !to) return null;
    const fact = from.facts.find((f) => f.ref && f.refId === le.to && f.predicate === le.predicate);
    if (!fact) return null;
    return { from: le.from, to: le.to, predicate: le.predicate, fact, fromLabel: from.label, toLabel: to.label };
  };
  const selectedEdge: EgoEdge | null = selEdge
    ? (() => {
        const le = graph.edges.find((e) => `${e.from}~${e.to}~${e.predicate}` === selEdge);
        return le ? layeredEdgeToEgo(le) : null;
      })()
    : null;
  const selectedCluster = selCluster ? graph.nodes.find((n) => n.id === selCluster && n.clusterOf) ?? null : null;

  const shown = graph.nodes.filter((n) => layout.has(n.id));
  // Edges bow toward the center as the wheel grows (the bundled concentric
  // look); at walk depth they run straight, with a direction dot that fades
  // out as rings multiply. NO predicate labels at any zoom (standing rule).
  const bow = Math.min(0.4, 0.22 * (zoom - 2));
  const dotOp = Math.max(0, Math.min(1, 1 - (zoom - 2) / 1.5));
  const ghostFade = reduced ? 0 : Math.max(0, Math.min(1, 1 - (zoom - 2) / 0.8));
  const anyFocus = hoverNode !== null || hoverEdge !== null || selEdge !== null;

  const baseTrans = reduced ? "none" : "opacity 90ms linear";
  const glideTrans = reduced
    ? "none"
    : `transform ${MOTION.recenter}ms ${MOTION.easeOut}, width ${MOTION.recenter}ms ${MOTION.easeOut}, opacity 120ms linear`;
  const enterTrans = (delay: number) =>
    `transform ${MOTION.enter}ms ${MOTION.easeOut} ${delay}ms, opacity ${MOTION.enter}ms ${MOTION.easeOut} ${delay}ms`;

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: 620, background: "#F6F2E9", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
      {/* ---- CANVAS ---- */}
      <div ref={canvasRef} style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden" }}>
        {/* the ONE scene — an always-on depth field that flattens as you pull out */}
        <div
          ref={sceneRef}
          onClick={(e) => { if (e.target === e.currentTarget) setSelEdge(null); }}
          style={{ position: "absolute", inset: 0, perspective: reduced ? "none" : `${DEPTH.perspective}px`, perspectiveOrigin: `50% ${DEPTH.originY * 100}%` }}
        >
          {/* decorative ghost silhouettes — walk-depth atmosphere, gone by ~2.8 */}
          {ghostFade > 0 && <GhostRing w={size.w} h={size.h} fade={ghostFade} />}

          {/* edges — endpoints are the perspective projection of the SAME pure
              positions the cards use, so lines track cards on every zoom frame.
              Clickable at every zoom via a fat transparent hit path: a real
              fact opens the inspector, a cluster spoke (predicate "") expands
              its chip. Re-keyed per center so a recenter re-fades them in
              after the cards have landed. */}
          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", zIndex: 5 }}
            aria-label="Relationship edges — click one for the fact behind it">
            <g key={center} style={{ animation: reduced ? undefined : `dm-edges-in 950ms ${MOTION.ease}` }}>
              {graph.edges.map((e) => {
                const pa = layout.get(e.from);
                const pb = layout.get(e.to);
                if (!pa || !pb) return null;
                const a = projectDepth(pa.x, pa.y, pa.z, size.w, size.h);
                const b = projectDepth(pb.x, pb.y, pb.z, size.w, size.h);
                const k = `${e.from}~${e.to}~${e.predicate}`;
                const chipSpoke = e.predicate === "";
                const incident = hoverNode !== null && (e.from === hoverNode || e.to === hoverNode);
                const active = hoverEdge === k || selEdge === k;
                const citedPair = citedSet.has(e.from) && citedSet.has(e.to);
                const lit = incident || active || citedPair;
                const dim = anyFocus && !lit;
                // Edges carry more ink at walk depth (few, structural) and
                // recede as rings multiply and the wheel fills with threads.
                const depthOp = Math.min(pa.op, pb.op) * Math.max(0.55, 0.85 - 0.1 * (zoom - 2));
                // Control point = the chord midpoint pulled toward the canvas
                // center by `bow` — radial edges stay near-straight, same-ring
                // links bow through the middle (hierarchical-bundling look).
                const cx = size.w / 2 + ((a.x + b.x) / 2 - size.w / 2) * (1 - bow);
                const cy = size.h / 2 + ((a.y + b.y) / 2 - size.h / 2) * (1 - bow);
                const d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
                const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
                const off = Math.min(11, len * 0.4);
                return (
                  <g key={k} style={{ opacity: dim ? 0.08 : lit ? 0.95 : depthOp, transition: `opacity ${MOTION.edgeFade}ms ${MOTION.ease}` }}>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onPointerEnter={() => setHoverEdge(k)} onPointerLeave={() => setHoverEdge(null)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (chipSpoke) { setSelCluster(e.from); setSelEdge(null); }
                        else { setSelEdge(k); setSelCluster(null); }
                      }} />
                    <path d={d} fill="none"
                      stroke={lit ? C.accent : "#D3C6AF"} strokeWidth={active ? 2 : lit ? 1.6 : 1} strokeLinecap="round"
                      style={{ pointerEvents: "none", transition: `stroke ${MOTION.hover}ms ${MOTION.ease}, stroke-width ${MOTION.hover}ms ${MOTION.ease}` }} />
                    {/* direction dot just inside the object end: subject —predicate→ object */}
                    {!chipSpoke && dotOp > 0.05 && (
                      <circle cx={b.x - (dx / len) * off} cy={b.y - (dy / len) * off} r={active ? 3 : 2.2}
                        fill={lit ? C.accent : "#D3C6AF"} opacity={dotOp} style={{ pointerEvents: "none" }} />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* the cards — each a MEMOIZED Card whose props only change on a zoom
              frame or for the hovered pair, so hovering never re-renders the
              fleet. Walk rings float above the fog; deeper rings haze under it. */}
          {shown.map((n) => {
            const p = layout.get(n.id)!;
            const en = anim?.get(n.id);
            const zi = n.hop === 0 ? 40 : n.hop <= 2 ? 36 - n.hop : Math.max(6, 29 - n.hop);
            return (
              <Card
                key={n.id}
                n={n}
                kindDef={kindByName.get(n.entity.kind)}
                pos={p}
                zi={zi}
                hovered={hoverNode === n.id}
                cited={citedSet.has(n.id)}
                chip={Boolean(n.clusterOf)}
                trans={reduced ? "none" : en ? enterTrans(en.delay) : anim ? glideTrans : baseTrans}
                enterFrom={en?.from}
                onHover={cardHover}
                onWalk={cardWalk}
                onExpand={cardExpand}
              />
            );
          })}

          {/* cream depth fog — distance reads as haze; the transparent middle
              keeps the walk rings clean while deep rings sink into it */}
          <div aria-hidden style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30,
            background: reduced ? "none" : `radial-gradient(120% 90% at 50% ${DEPTH.originY * 100}%, rgba(246,242,233,0) 42%, rgba(246,242,233,.45) 80%, rgba(239,233,220,.75) 100%)`,
          }} />
        </div>

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
              {trail.slice(-4).map((id, i, shownTrail) => {
                const idx = trail.length - shownTrail.length + i;
                const last = i === shownTrail.length - 1;
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
          click a card to walk · click an edge for its fact{maxZoom > 2 ? " · scroll to zoom" : ""}
        </div>
        <div className="dm-mono" style={{ position: "absolute", right: 18, bottom: 13, ...micro, zIndex: 50, opacity: 0.7, pointerEvents: "none" }}>
          {reduced ? "reduced motion · " : ""}{zoom.toFixed(1)} of {maxZoom} rings · {graph.nodes.length} nodes · {graph.edges.length} links
        </div>

        {/* The fact inspector + cluster panel work at every zoom level. */}
        {selectedEdge && (
          <EdgeInspector edge={selectedEdge} onClose={() => setSelEdge(null)} onGoTo={(id) => { setSelEdge(null); goTo(id); }} />
        )}
        {selectedCluster && (
          <ClusterPanel
            node={{ label: selectedCluster.entity.label, kind: selectedCluster.entity.kind, clusterOf: selectedCluster.clusterOf }}
            byId={byId}
            kindDef={kindByName.get(selectedCluster.entity.kind)}
            onClose={() => setSelCluster(null)}
            onGoTo={(id) => { setSelCluster(null); goTo(id); }}
          />
        )}

        <style>{`
          @keyframes dm-edges-in { 0%, 55% { opacity: 0; } 100% { opacity: 1; } }
          .dm-pop { transition: transform 130ms cubic-bezier(0.16,1,0.3,1); }
          .dm-lcard:hover .dm-pop, .dm-lcard:focus-visible .dm-pop { transform: scale(var(--pop, 1.1)); }
          .dm-lcard:focus-visible { z-index: 60 !important; filter: none !important; }
        `}</style>
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
