"use client";

/**
 * GRAPH — the whole vault on one canvas (the Explorer's opposite: no center,
 * no rings — EVERYTHING at once). graphology holds the in-memory graph,
 * sigma.js draws it in WebGL, so thousands of nodes stay smooth where the
 * hand-rolled DOM walk tops out at a modest ring count (ROADMAP "Explorer v2
 * experiment", 2026-07-14). The user picks the layout (organic / circle / by
 * kind); every layout is DETERMINISTIC (same vault in → same picture out —
 * the walk's "no wiggle" spirit).
 *
 * Rendering is custom (2026-07-14, user ask): nodes are tiny CARDS (rounded
 * rectangles, paper fill + kind-colored frame — graph-card-program.ts), edges
 * CURVE (@sigma/edge-curve) like the walk's arcs, and clicking a node opens
 * the Explorer's natural-shape SIDE PANEL on the right — record table,
 * relationships, and the full markdown body (EntityPageBody), wikilinks
 * resolving to real nodes. The canvas is the map; the panel is the card.
 *
 * All heavy libs load lazily inside the mount effect — the dashboard bundle
 * never pays for WebGL until the tab is opened, and SSR never touches them.
 * Predicate names are NOT drawn on edges (standing rule 2026-07-14) — they
 * live in the link inspector a click opens.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { C, Segmented } from "./ui";
import { EntityPageBody } from "./entity-page";
import { buildNodeResolver } from "./markdown";
import { buildVaultGraph, type VaultEdge } from "@/lib/datamodo/vault-graph";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";
import type Sigma from "sigma";

/* Same fallback tones as the Knowledge cards — the registry color wins. */
const KIND_TONE: Record<string, string> = {
  person: C.blue,
  people: C.blue,
  company: C.accent,
  org: C.accent,
  organization: C.accent,
  invoice: C.gold,
  project: C.green,
  dataset: "#211E18",
};

type GraphLayout = "organic" | "circle" | "kinds";
type Selection = { node?: string; edge?: VaultEdge; /** glide the camera onto the node */ fly?: boolean };

const DIM_NODE = "#E6DFD1";
const DIM_EDGE = "#F0EADD";
const EDGE = "#E1D9C8";

const micro: CSSProperties = { fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#A39B8B" };

/** Resolve a next/font CSS variable into a canvas-usable font-family list —
 *  sigma draws labels on a 2D canvas, where `var(--…)` doesn't exist. */
function fontOf(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.body).getPropertyValue(cssVar).trim();
  return val ? `${val}, ${fallback}` : fallback;
}

/** The click target's facts — "A predicate B" per fact, endpoints clickable. */
function LinkInspector({ edge, byId, onGoTo, onClose }: {
  edge: VaultEdge;
  byId: Map<string, KnowledgeEntityView>;
  onGoTo: (id: string) => void;
  onClose: () => void;
}) {
  const labelOf = (id: string) => byId.get(id)?.label ?? "?";
  const endpoint: CSSProperties = { background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: "inherit", fontWeight: 600, color: C.ink, cursor: "pointer" };
  return (
    <div style={{ position: "absolute", top: 14, right: 14, width: 280, background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 18, padding: "14px 16px", boxShadow: "0 18px 40px -22px rgba(33,30,24,.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span className="dm-mono" style={micro}>link · {edge.weight} fact{edge.weight === 1 ? "" : "s"}</span>
        <button type="button" onClick={onClose} className="dm-mono" style={{ marginLeft: "auto", background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {edge.facts.map((f, i) => (
          <div key={i} style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.35 }}>
            <button type="button" onClick={() => onGoTo(f.from)} style={endpoint}>{labelOf(f.from)}</button>
            <span className="dm-mono" style={{ fontSize: 10.5, color: C.accent, margin: "0 6px" }}>{f.predicate.replace(/_/g, " ")}</span>
            <button type="button" onClick={() => onGoTo(f.to)} style={endpoint}>{labelOf(f.to)}</button>
          </div>
        ))}
      </div>
      <div className="dm-mono" style={{ fontSize: 10, color: "#B7AF9F", marginTop: 10 }}>
        sources & confidence live in the walk&apos;s inspector
      </div>
    </div>
  );
}

export function GraphView({ entities, kindByName, onOpenPage, onExplore }: {
  entities: KnowledgeEntityView[];
  kindByName: Map<string, KindDef>;
  /** Open an entity's page (natural shape) from the panel. */
  onOpenPage: (id: string) => void;
  /** Jump into the Explorer walk centered on this node. */
  onExplore: (id: string) => void;
}) {
  const data = useMemo(() => buildVaultGraph(entities), [entities]);
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  // Body [[wikilinks]] in the side panel resolve against the same world.
  const resolveNode = useMemo(() => buildNodeResolver(entities), [entities]);
  const toneOf = (kind: string) => kindByName.get(kind)?.color ?? KIND_TONE[kind.toLowerCase()] ?? C.ink;

  const [layout, setLayout] = useState<GraphLayout>("organic");
  const [selected, setSelected] = useState<Selection | null>(null);
  // Readiness by identity: "the renderer for THIS (data, layout) is up" — a
  // layout/data change makes it stale for free, no setState-in-effect reset.
  const [readyFor, setReadyFor] = useState<{ data: unknown; layout: GraphLayout } | null>(null);
  const ready = readyFor?.data === data && readyFor?.layout === layout;
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<Selection | null>(null);
  const applyFocusRef = useRef<() => void>(() => {});
  const flyToRef = useRef<(id: string) => void>(() => {});

  // `select` only writes state; the ref-touching work (refresh the WebGL
  // frame, glide the camera) happens in the selection effect below — the
  // react-hooks/refs rule forbids render-created handlers reading refs.
  const select = (v: Selection | null) => {
    selectedRef.current = v;
    setSelected(v);
  };
  /** Panel-driven navigation (relationship chips, wikilinks): stay in the
   *  graph when the target is on the canvas, else open its page. */
  const goTo = (id: string) => {
    if (byId.has(id)) select({ node: id, fly: true });
    else onOpenPage(id);
  };
  useEffect(() => {
    applyFocusRef.current();
    if (selected?.node && selected.fly) flyToRef.current(selected.node);
  }, [selected]);

  // Kind legend — how to read the cards. Top kinds by population.
  const legend = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of data.nodes) m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [data]);

  useEffect(() => {
    let dead = false;
    let renderer: Sigma | null = null;
    (async () => {
      // Lazy: graphology + sigma + layouts + the custom programs enter the
      // page only here.
      const [gMod, sMod, layoutMod, fa2Mod, curveMod, cardMod] = await Promise.all([
        import("graphology"),
        import("sigma"),
        import("graphology-layout"),
        import("graphology-layout-forceatlas2"),
        import("@sigma/edge-curve"),
        import("./graph-card-program"),
      ]);
      const el = containerRef.current;
      if (dead || !el) return;
      const Graph = gMod.default;
      const SigmaCtor = sMod.default;
      const { circular, circlepack } = layoutMod;
      const forceAtlas2 = fa2Mod.default;
      const EdgeCurveProgram = curveMod.default;
      const { default: NodeCardProgram, drawCardNodeLabel, drawCardNodeHover } = cardMod;

      const g = new Graph({ type: "undirected", multi: false });
      for (const n of data.nodes) {
        g.addNode(n.id, {
          label: n.label,
          kind: n.kind,
          color: toneOf(n.kind),
          // Cards cover less of their radius than discs — a touch bigger.
          size: Math.min(18, 4.5 + Math.sqrt(n.degree) * 2.5),
        });
      }
      data.edges.forEach((e, idx) => {
        g.addEdge(e.a, e.b, { idx, size: 0.7 + Math.min(2.4, (e.weight - 1) * 0.6) });
      });

      // Layouts — all deterministic (circular seed → FA2 is a fixed-point
      // iteration with no randomness). FA2 runs synchronously; at real
      // whole-vault scale a worker is the documented follow-up.
      circular.assign(g, { scale: 100 });
      if (layout === "kinds") {
        circlepack.assign(g, { hierarchyAttributes: ["kind"] });
      } else if (layout === "organic" && g.order > 2) {
        forceAtlas2.assign(g, {
          iterations: Math.max(150, Math.min(500, Math.round(60_000 / Math.max(1, g.order)))),
          settings: { ...forceAtlas2.inferSettings(g), edgeWeightInfluence: 0 },
        });
      }

      // A stale selection (vault changed underneath) must not survive.
      const sel = selectedRef.current;
      if (sel?.node && !g.hasNode(sel.node)) select(null);
      if (sel?.edge && !data.edges.some((e) => e.a === sel.edge!.a && e.b === sel.edge!.b)) select(null);

      // Focus model: hover wins, then the selection; everything else dims.
      let lit: Set<string> | null = null;
      let focus: string | null = null;
      const applyFocus = () => {
        const s = selectedRef.current;
        const h = hoverRef.current;
        if (h && g.hasNode(h)) { lit = new Set([h, ...g.neighbors(h)]); focus = h; }
        else if (s?.node && g.hasNode(s.node)) { lit = new Set([s.node, ...g.neighbors(s.node)]); focus = s.node; }
        else if (s?.edge) { lit = new Set([s.edge.a, s.edge.b]); focus = null; }
        else { lit = null; focus = null; }
        renderer?.refresh({ skipIndexation: true });
      };
      applyFocusRef.current = applyFocus;

      try {
        renderer = new SigmaCtor(g, el, {
          // Cream world: warm curved lines, ink labels, kind-framed paper
          // CARDS (custom node program — the walk's grammar in miniature).
          // Labels only when a card is big enough to deserve one —
          // hover/selection forces them on the lit neighborhood.
          defaultNodeType: "card",
          nodeProgramClasses: { card: NodeCardProgram },
          defaultEdgeType: "curved",
          edgeProgramClasses: { curved: EdgeCurveProgram },
          defaultDrawNodeLabel: drawCardNodeLabel,
          defaultDrawNodeHover: drawCardNodeHover,
          labelFont: fontOf("--font-geist-sans", "system-ui, sans-serif"),
          labelSize: 11,
          labelWeight: "500",
          labelColor: { color: "#3A352C" },
          labelRenderedSizeThreshold: 7,
          defaultEdgeColor: EDGE,
          enableEdgeEvents: true,
          zIndex: true,
          // NO stagePadding override: sigma 3.0.3's picking buffer misaligns
          // under a custom padding (repro'd in isolation — every click read
          // as stage), which silently killed node/edge clicks.
          minCameraRatio: 0.04,
          maxCameraRatio: 6,
          nodeReducer: (node, attrs) => {
            if (!lit) return attrs;
            if (!lit.has(node)) return { ...attrs, color: DIM_NODE, label: null, zIndex: 0 };
            return { ...attrs, forceLabel: true, zIndex: 2, highlighted: node === focus };
          },
          edgeReducer: (edge, attrs) => {
            if (!lit) return attrs;
            const [s, t] = g.extremities(edge);
            if (lit.has(s) && lit.has(t)) return { ...attrs, color: C.accent, size: (attrs.size ?? 1) + 0.4, zIndex: 1 };
            return { ...attrs, color: DIM_EDGE, zIndex: 0 };
          },
        });
      } catch {
        // WebGL missing (old browser, headless without GPU) — degrade to a
        // message, never a crash screen. The walk still covers exploration.
        if (!dead) setError("The graph canvas couldn't start here (WebGL unavailable). The ◍ Explore walk still works.");
        return;
      }

      renderer.on("enterNode", ({ node }) => { hoverRef.current = node; el.style.cursor = "pointer"; applyFocus(); });
      renderer.on("leaveNode", () => { hoverRef.current = null; el.style.cursor = ""; applyFocus(); });
      renderer.on("clickNode", ({ node }) => select({ node }));
      renderer.on("clickEdge", ({ edge }) => {
        const idx = g.getEdgeAttribute(edge, "idx") as number;
        const ve = data.edges[idx];
        if (ve) select({ edge: ve });
      });
      renderer.on("clickStage", () => select(null));

      // Panel-driven recenter: glide the camera onto a node (reduced motion
      // jumps — the base state IS the end state).
      const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      flyToRef.current = (id) => {
        if (!renderer || !g.hasNode(id)) return;
        const d = renderer.getNodeDisplayData(id);
        if (d) renderer.getCamera().animate({ x: d.x, y: d.y }, { duration: reduced ? 0 : 350 });
      };

      sigmaRef.current = renderer;
      applyFocus();
      if (!dead) setReadyFor({ data, layout });
    })();
    return () => {
      dead = true;
      applyFocusRef.current = () => {};
      flyToRef.current = () => {};
      renderer?.kill();
      sigmaRef.current = null;
    };
    // toneOf/select are stable in effect terms (derived from props/refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, layout, kindByName]);

  const selEntity = selected?.node ? byId.get(selected.node) : null;
  const selNode = selected?.node ? data.nodes.find((n) => n.id === selected.node) : null;

  return (
    <div>
      {/* Toolbar: the layout dial + honest counts. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="dm-mono" style={micro}>Layout</span>
        <Segmented value={layout} onChange={setLayout} options={[
          { v: "organic", label: "✦ Organic" },
          { v: "circle", label: "◯ Circle" },
          { v: "kinds", label: "◉ By kind" },
        ]} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
          {legend.map(([kind, count]) => (
            <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: toneOf(kind), flexShrink: 0 }} />
              <span className="dm-mono" style={{ fontSize: 10, color: "#8A8477" }}>{kind} <span style={{ color: "#B7AF9F" }}>{count}</span></span>
            </span>
          ))}
          <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>{data.nodes.length} nodes · {data.edges.length} links</span>
        </div>
      </div>

      {/* Canvas + side panel — the walk's frame and panel grammar. */}
      <div style={{ display: "flex", alignItems: "stretch", height: 620, background: "#F6F2E9", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          {error ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              <p style={{ fontSize: 13.5, color: "#8A8477", maxWidth: "44ch", textAlign: "center", margin: 0 }}>{error}</p>
            </div>
          ) : (
            <>
              <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
              {!ready && (
                <div className="dm-mono" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#A39B8B", pointerEvents: "none" }}>
                  drawing your graph…
                </div>
              )}
              <div className="dm-mono" style={{ position: "absolute", left: 14, bottom: 12, fontSize: 10, color: "#B7AF9F", pointerEvents: "none" }}>
                drag to pan · scroll to zoom · click a card or a link
              </div>

              {/* Link inspector — the click target's facts; predicate names
                  live HERE, never on the canvas. */}
              {selected?.edge && (
                <LinkInspector edge={selected.edge} byId={byId} onGoTo={goTo} onClose={() => select(null)} />
              )}
            </>
          )}
        </div>

        {/* ---- SIDE PANEL: the clicked node in its natural shape (the
            Explorer's panel grammar — record table, relationships, and the
            full markdown body with live wikilinks). ---- */}
        <aside style={{ width: 320, flexShrink: 0, borderLeft: "1px solid #EFE9DC", background: "#FCFAF4", display: "flex", flexDirection: "column" }}>
          {selEntity ? (
            <>
              <div style={{ padding: "16px 16px 13px", borderBottom: "1px solid #EFE9DC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span className="dm-mono" style={{ ...micro, color: toneOf(selEntity.kind) }}>
                    {kindByName.get(selEntity.kind)?.label ?? selEntity.kind}
                  </span>
                  <button type="button" onClick={() => onExplore(selEntity.id)} className="dm-mono"
                    style={{ marginLeft: "auto", fontSize: 10.5, color: "#fff", background: C.accent, border: "none", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}>
                    ◍ Walk
                  </button>
                  <button type="button" onClick={() => onOpenPage(selEntity.id)} className="dm-mono"
                    style={{ fontSize: 10.5, color: C.ink, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}>
                    Full page ›
                  </button>
                </div>
                <div className="dm-display" style={{ fontWeight: 700, fontSize: 21, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.1 }}>{selEntity.label}</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: "#8A8477" }}>
                  {selNode?.degree ?? 0} connection{(selNode?.degree ?? 0) === 1 ? "" : "s"}
                  {selEntity.facts.filter((f) => !f.ref).length > 0 ? ` · ${selEntity.facts.filter((f) => !f.ref).length} fact${selEntity.facts.filter((f) => !f.ref).length === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <div key={selEntity.id} style={{ flex: 1, overflowY: "auto", padding: "16px 18px 20px" }}>
                <EntityPageBody e={selEntity} kindDef={kindByName.get(selEntity.kind)} onOpen={goTo} resolveNode={resolveNode} variant="flat" />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 28px", textAlign: "center" }}>
              <div style={{ width: 44, height: 30, borderRadius: 8, border: "1.5px solid #DDD5C5", background: "#FFFDF8", marginBottom: 14 }} />
              <div style={{ fontSize: 13, color: "#8A8477", lineHeight: 1.5 }}>Click a card to read it here — its record, its links, its notes.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
