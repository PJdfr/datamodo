"use client";

/**
 * GRAPH — the whole vault on one canvas (the Explorer's opposite: no center,
 * no rings — EVERYTHING at once). graphology holds the in-memory graph,
 * sigma.js draws it in WebGL, so thousands of nodes stay smooth where the
 * hand-rolled DOM walk tops out at a modest ring count (ROADMAP "Explorer v2
 * experiment", 2026-07-14). Nodes stay dots — the card richness lives in the
 * side panel and the entity page; the canvas is the map. The user picks the
 * layout (organic / circle / by kind); every layout is DETERMINISTIC (same
 * vault in → same picture out — the walk's "no wiggle" spirit).
 *
 * Both heavy libs load lazily inside the mount effect — the dashboard bundle
 * never pays for WebGL until the tab is opened, and SSR never touches them.
 * Predicate names are NOT drawn on edges (standing rule 2026-07-14) — they
 * live in the inspector panel a click opens.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { C, Segmented } from "./ui";
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
type Selection = { node?: string; edge?: VaultEdge };

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

  const select = (v: Selection | null) => {
    selectedRef.current = v;
    setSelected(v);
    applyFocusRef.current();
  };

  // Kind legend — how to read the dots. Top kinds by population.
  const legend = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of data.nodes) m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [data]);

  useEffect(() => {
    let dead = false;
    let renderer: Sigma | null = null;
    (async () => {
      // Lazy: graphology + sigma + layouts enter the page only here.
      const [gMod, sMod, layoutMod, fa2Mod] = await Promise.all([
        import("graphology"),
        import("sigma"),
        import("graphology-layout"),
        import("graphology-layout-forceatlas2"),
      ]);
      const el = containerRef.current;
      if (dead || !el) return;
      const Graph = gMod.default;
      const SigmaCtor = sMod.default;
      const { circular, circlepack } = layoutMod;
      const forceAtlas2 = fa2Mod.default;

      const g = new Graph({ type: "undirected", multi: false });
      for (const n of data.nodes) {
        g.addNode(n.id, {
          label: n.label,
          kind: n.kind,
          color: toneOf(n.kind),
          size: Math.min(16, 3.5 + Math.sqrt(n.degree) * 2.2),
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
          // Cream world: warm lines, ink labels, kind-colored dots. Labels
          // only when a node is big enough to deserve one — hover/selection
          // forces them on the lit neighborhood.
          labelFont: fontOf("--font-geist-sans", "system-ui, sans-serif"),
          labelSize: 11,
          labelWeight: "500",
          labelColor: { color: "#3A352C" },
          labelRenderedSizeThreshold: 7,
          defaultEdgeColor: EDGE,
          enableEdgeEvents: true,
          zIndex: true,
          stagePadding: 42,
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

      sigmaRef.current = renderer;
      applyFocus();
      if (!dead) setReadyFor({ data, layout });
    })();
    return () => {
      dead = true;
      applyFocusRef.current = () => {};
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

      {/* The canvas — same frame as the walk. */}
      <div style={{ position: "relative", height: 620, background: "#F6F2E9", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
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
              drag to pan · scroll to zoom · click a node or a link
            </div>

            {/* Inspector panel — the click target's details; cards stay rich
                HERE, the canvas stays a map. */}
            {selEntity && selNode && (
              <div style={{ position: "absolute", top: 14, right: 14, width: 264, background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 18, padding: "14px 16px", boxShadow: "0 18px 40px -22px rgba(33,30,24,.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: toneOf(selEntity.kind), flexShrink: 0 }} />
                  <span className="dm-mono" style={micro}>{selEntity.kind}</span>
                  <button type="button" onClick={() => select(null)} className="dm-mono" style={{ marginLeft: "auto", background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                </div>
                <div className="dm-display" style={{ fontWeight: 700, fontSize: 16.5, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.2 }}>{selEntity.label}</div>
                <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 4 }}>
                  {selNode.degree} link{selNode.degree === 1 ? "" : "s"} · {selEntity.facts.length} fact{selEntity.facts.length === 1 ? "" : "s"}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={() => onExplore(selEntity.id)}
                    style={{ flex: 1, background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: "8px 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    ◍ Walk from here
                  </button>
                  <button type="button" onClick={() => onOpenPage(selEntity.id)}
                    style={{ background: "#fff", color: C.ink, border: "1px solid #E1D9C8", borderRadius: 9, padding: "8px 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>
                    open ›
                  </button>
                </div>
              </div>
            )}
            {selected?.edge && (() => {
              const e = selected.edge;
              const labelOf = (id: string) => byId.get(id)?.label ?? "?";
              return (
                <div style={{ position: "absolute", top: 14, right: 14, width: 280, background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 18, padding: "14px 16px", boxShadow: "0 18px 40px -22px rgba(33,30,24,.35)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span className="dm-mono" style={micro}>link · {e.weight} fact{e.weight === 1 ? "" : "s"}</span>
                    <button type="button" onClick={() => select(null)} className="dm-mono" style={{ marginLeft: "auto", background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {e.facts.map((f, i) => (
                      <div key={i} style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 600 }}>{labelOf(f.from)}</span>
                        <span className="dm-mono" style={{ fontSize: 10.5, color: C.accent, margin: "0 6px" }}>{f.predicate.replace(/_/g, " ")}</span>
                        <span style={{ fontWeight: 600 }}>{labelOf(f.to)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="dm-mono" style={{ fontSize: 10, color: "#B7AF9F", marginTop: 10 }}>
                    sources & confidence live in the walk&apos;s inspector
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
