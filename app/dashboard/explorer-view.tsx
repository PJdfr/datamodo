"use client";

/**
 * EXPLORER — stand on a node and look around; walk the graph edge by edge.
 * The dream this serves: every hop shows the node in its NATURAL SHAPE (record
 * table / markdown page / note) with its sources, and every edge is MORE than
 * a link — click one to see its predicate, confidence, since-when, and the
 * exact messages behind it. Obsidian-style wandering, but the nodes are
 * anything and the edges carry meaning.
 *
 * Left: the ego-graph canvas (center + 2 rings, deterministic radial layout,
 * pure core in lib/datamodo/explorer.ts). Click a neighbor → it becomes the
 * center (breadcrumb trail remembers the walk). Click an edge → the inspector.
 * Right: the current node's page (shared EntityPageBody) or the edge's card.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { C, SourceRow } from "./ui";
import { buildEgoGraph, radialLayout, type EgoEdge } from "@/lib/datamodo/explorer";
import { EntityPageBody } from "./entity-page";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

const W = 640;
const H = 520;

const KIND_TONE: Record<string, string> = {
  person: C.blue, company: C.accent, org: C.accent, organization: C.accent,
  invoice: C.gold, project: C.green, concept: C.accent, document: C.green, note: C.gold,
};
const toneOf = (kind: string, kindDef?: KindDef) => kindDef?.color ?? KIND_TONE[kind.toLowerCase()] ?? C.ink;

const chipW = (label: string, hop: number) =>
  Math.max(hop === 0 ? 80 : 54, Math.min(hop === 0 ? 200 : 150, label.length * (hop === 2 ? 6 : 7) + 20));

const kicker: CSSProperties = { fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" };

function EdgeInspector({ edge, onClose, onCenter }: { edge: EgoEdge; onClose: () => void; onCenter: (id: string) => void }) {
  const f = edge.fact;
  const conf = Math.round((f.confidence ?? 1) * 100);
  const since = f.validFrom ? f.validFrom.slice(0, 10) : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="dm-mono" style={{ ...kicker, color: C.accent }}>edge</span>
        <button onClick={onClose} aria-label="Back to the node" style={{ border: "none", background: "transparent", color: "#A39B8B", cursor: "pointer", fontSize: 14, padding: 2 }}>×</button>
      </div>

      {/* A —predicate→ B, both ends walkable */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
        <button type="button" onClick={() => onCenter(edge.from)} className="dm-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink, background: "#FBF8F1", border: "1px solid #E1D9C8", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>{edge.fromLabel}</button>
        <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>—{edge.predicate.replace(/_/g, " ")}→</span>
        <button type="button" onClick={() => onCenter(edge.to)} className="dm-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink, background: "#FBF8F1", border: "1px solid #E1D9C8", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>{edge.toLabel}</button>
      </div>

      {/* The edge's metadata — an edge is more than a link */}
      <div style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
        {([
          ["semantics", edge.predicate.replace(/_/g, " ")],
          ["confidence", `${conf}%`],
          ...(since ? [["since", since]] : []),
          ["strength", `${f.sources} corroborating message${f.sources === 1 ? "" : "s"}`],
        ] as [string, string][]).map(([k, v]) => (
            <div key={k as string} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 10, padding: "6px 10px", borderBottom: "1px solid #F1ECDF", alignItems: "baseline" }}>
              <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>{k}</span>
              <span style={{ fontSize: 12.5, color: "#3A352C" }}>{v}</span>
            </div>
          ))}
      </div>

      <div className="dm-mono" style={{ ...kicker, marginBottom: 6 }}>{f.provenance.length ? "evidence" : "evidence — none recorded"}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {f.provenance.map((s, i) => <SourceRow key={i} s={s} />)}
      </div>
    </div>
  );
}

export function ExplorerView({ entities, initialId, kindByName, onOpenPage }: {
  entities: KnowledgeEntityView[];
  initialId: string;
  kindByName: Map<string, KindDef>;
  /** Open the full page modal for a node. */
  onOpenPage?: (id: string) => void;
}) {
  const [center, setCenter] = useState(initialId);
  const [trail, setTrail] = useState<string[]>([]);
  const [selEdge, setSelEdge] = useState<EgoEdge | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [jump, setJump] = useState("");

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const graph = useMemo(() => buildEgoGraph(entities, center), [entities, center]);
  const pos = useMemo(() => (graph ? radialLayout(graph, W, H) : {}), [graph]);

  const recenter = (id: string) => {
    if (id === center || !byId.has(id)) return;
    setTrail((t) => [...t, center].slice(-12));
    setCenter(id);
    setSelEdge(null);
    setHover(null);
  };
  const back = () => {
    setTrail((t) => {
      const prev = t[t.length - 1];
      if (prev) { setCenter(prev); setSelEdge(null); }
      return t.slice(0, -1);
    });
  };

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

  return (
    <div style={{ background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
      {/* trail + jump */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid #EFE9DC" }}>
        <button type="button" onClick={back} disabled={trail.length === 0} className="dm-mono" title="Step back"
          style={{ fontSize: 11, color: trail.length ? C.ink : "#C9C2B2", background: "#fff", border: "1px solid #E1D9C8", borderRadius: 7, padding: "3px 9px", cursor: trail.length ? "pointer" : "default", fontFamily: "inherit" }}>
          ← back
        </button>
        {trail.slice(-4).map((id, i) => (
          <button key={`${id}${i}`} type="button" onClick={() => recenter(id)} className="dm-mono"
            style={{ fontSize: 10.5, color: "#8A8477", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {byId.get(id)?.label ?? "?"} ›
          </button>
        ))}
        <span className="dm-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink, letterSpacing: "-0.01em" }}>{centerEntity.label}</span>
        <div style={{ position: "relative", marginLeft: "auto", minWidth: 200 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 11 }}>⌕</span>
          <input value={jump} onChange={(e) => setJump(e.target.value)} placeholder="Jump to anything…"
            style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 8, padding: "5px 9px 5px 24px", fontFamily: "inherit", fontSize: 12, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" }} />
          {jumpMatches.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5, background: "#fff", border: "1px solid #E7E0D2", borderRadius: 10, boxShadow: "0 12px 28px rgba(33,30,24,.14)", overflow: "hidden" }}>
              {jumpMatches.map((m) => (
                <button key={m.id} type="button" onClick={() => { recenter(m.id); setJump(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: toneOf(m.kind, kindByName.get(m.kind)), flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                  <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9, color: "#B7AF9F", textTransform: "uppercase" }}>{m.kind}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* canvas */}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", flex: 1, minWidth: 0, fontSize: 12 }} role="img"
          aria-label={`Neighborhood of ${centerEntity.label} — click a node to walk to it, click an edge for its evidence`}>
          {/* rings */}
          {[0.28, 0.46].map((r, i) => (
            <ellipse key={i} cx={W / 2} cy={H / 2} rx={Math.min(W, H) * r} ry={Math.min(W, H) * r * 0.82} fill="none" stroke="#F0EADC" strokeWidth={1} />
          ))}
          {/* edges */}
          {graph.edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            if (!a || !b) return null;
            const sel = selEdge === e;
            const lit = sel || hover === e.from || hover === e.to;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g key={i} onClick={(ev) => { ev.stopPropagation(); setSelEdge(sel ? null : e); }} style={{ cursor: "pointer" }}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={sel ? C.accent : lit ? "#C9A38F" : "#DDD5C5"}
                  strokeWidth={sel ? 2.25 : 1 + Math.min(2, e.fact.sources * 0.5)}
                  strokeLinecap="round" style={{ transition: "stroke .15s ease" }} />
                {(sel || lit) && (
                  <text x={mx} y={my - 6} textAnchor="middle" className="dm-mono"
                    style={{ fontSize: 9.5, fill: sel ? C.accent : "#8A8477", letterSpacing: "0.03em", paintOrder: "stroke", stroke: "#FFFDF8", strokeWidth: 3, pointerEvents: "none" }}>
                    {e.predicate.replace(/_/g, " ")}
                  </text>
                )}
              </g>
            );
          })}
          {/* nodes */}
          {graph.nodes.map((n) => {
            const p = pos[n.id];
            if (!p) return null;
            const isCenter = n.hop === 0;
            const w = chipW(n.label, n.hop);
            const h = isCenter ? 36 : n.hop === 1 ? 28 : 24;
            const tone = toneOf(n.kind, kindByName.get(n.kind));
            const lit = hover === n.id;
            return (
              <g key={n.id} tabIndex={0}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                onClick={(ev) => { ev.stopPropagation(); if (!isCenter) recenter(n.id); }}
                onKeyDown={(ev) => { if ((ev.key === "Enter" || ev.key === " ") && !isCenter) { ev.preventDefault(); recenter(n.id); } }}
                style={{
                  cursor: isCenter ? "default" : "pointer", outline: "none",
                  transform: `translate(${p.x}px, ${p.y}px) scale(${lit && !isCenter ? 1.07 : 1})`,
                  transformBox: "fill-box", transformOrigin: "center",
                  transition: "transform .2s cubic-bezier(0.34,1.32,0.5,1)",
                  opacity: n.hop === 2 && !lit ? 0.82 : 1,
                }}>
                <title>{isCenter ? `${n.label} — you are here` : `Walk to ${n.label}`}</title>
                {isCenter && <rect x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} rx={(h + 8) / 2} fill="none" stroke={C.accent} strokeWidth={1.5} opacity={0.6} />}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2}
                  fill={isCenter ? "#FDF6F2" : "#fff"} stroke={isCenter ? C.accent : lit ? tone : "#E7E0D2"} strokeWidth={isCenter || lit ? 1.5 : 1}
                  style={{ filter: isCenter ? "drop-shadow(0 10px 20px rgba(33,30,24,.16))" : "drop-shadow(0 4px 10px rgba(33,30,24,.08))" }} />
                <circle cx={-w / 2 + 13} cy={0} r={n.hop === 2 ? 3.5 : 4.5} fill={tone} />
                <text x={6} y={1} textAnchor="middle" dominantBaseline="middle"
                  style={{ fontWeight: isCenter ? 700 : 600, fontSize: isCenter ? 13 : n.hop === 2 ? 10.5 : 12, fill: C.ink, letterSpacing: "-0.01em", pointerEvents: "none" }}>
                  {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* panel: the node in its natural shape, or the selected edge */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid #EFE9DC", background: "#FCFAF4", padding: "14px 14px 16px", overflowY: "auto", maxHeight: H }}>
          {selEdge ? (
            <EdgeInspector edge={selEdge} onClose={() => setSelEdge(null)} onCenter={recenter} />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span className="dm-mono" style={{ ...kicker, color: toneOf(centerEntity.kind, kindByName.get(centerEntity.kind)) }}>
                  {kindByName.get(centerEntity.kind)?.label ?? centerEntity.kind}
                </span>
                {onOpenPage && (
                  <button type="button" onClick={() => onOpenPage(center)} className="dm-mono"
                    style={{ fontSize: 10.5, color: C.ink, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}>
                    Full page ›
                  </button>
                )}
              </div>
              <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.15, marginBottom: 12 }}>{centerEntity.label}</div>
              <EntityPageBody e={centerEntity} kindDef={kindByName.get(centerEntity.kind)} onOpen={recenter} />
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderTop: "1px solid #EFE9DC", background: "#FBF8F1" }}>
        <span className="dm-mono" style={kicker}>Click a node to walk to it · click an edge for its evidence</span>
        <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: "#A39B8B" }}>
          {graph.nodes.length} nodes · {graph.edges.length} edges{graph.truncated > 0 ? ` · ${graph.truncated} more beyond the rings` : ""}
        </span>
      </div>
    </div>
  );
}
