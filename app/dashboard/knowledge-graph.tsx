"use client";

/**
 * KNOWLEDGE GRAPH — the connected view of the knowledge layer, interaction
 * model ported from the design-system KnowledgeGraph (design/system/components/
 * motion): hover lights a node's neighborhood, drag rearranges (edges follow
 * live), click pins an inspector with the entity's facts and links.
 *
 * What is a node? A canonical ENTITY (person, company, invoice…). What is an
 * edge? A relationship FACT (a fact whose value is another entity), labelled by
 * its predicate. Attribute facts (amounts, dates, text) live in the inspector,
 * not as nodes — they'd drown the graph. Messages/documents aren't nodes yet.
 *
 * CURATION — the canvas is a lived-in space, not a fresh layout each visit:
 * - dragging a node PINS it: the position persists (entities.graph_pin,
 *   normalized 0..1) and survives reloads; unpin from the inspector.
 * - a kind-cluster can COLLAPSE into one hypernode ("Invoices (12)") via the
 *   cluster chips; edges reroute to it; click the hypernode to expand.
 *
 * Layout: deterministic — kind-clusters seeded around an ellipse, then a short
 * synchronous force relaxation (repulsion + edge springs). Pinned nodes are
 * held fixed; everything else settles around them. No jitter between visits.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { C } from "./ui";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";

const W = 920;
const H = 560;
const MAX_NODES = 60;
const CHIP_H = 30;

const KIND_TONE: Record<string, string> = {
  person: C.blue,
  people: C.blue,
  company: C.accent,
  org: C.accent,
  organization: C.accent,
  invoice: C.gold,
  project: C.green,
};
const toneOf = (kind: string) => KIND_TONE[kind.toLowerCase()] ?? C.ink;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const IRREGULAR_PLURAL: Record<string, string> = { person: "people", company: "companies", organization: "organizations" };
const plural = (kind: string) => {
  const key = kind.toLowerCase();
  if (IRREGULAR_PLURAL[key]) return IRREGULAR_PLURAL[key];
  if (/[^aeiou]y$/.test(kind)) return kind.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/.test(kind)) return kind + "es";
  return kind + "s";
};

/** Deterministic PRNG so the layout is identical on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Node = {
  id: string;
  label: string;
  kind: string;
  entity?: KnowledgeEntityView;
  /** A collapsed kind-cluster rendered as one node. */
  hyper?: boolean;
  count?: number;
};
type Edge = { from: string; to: string; predicate: string };
type Pos = { x: number; y: number };
type NormPin = { x: number; y: number }; // 0..1, canvas-relative

const hyperId = (kind: string) => `kind:${kind}`;

function chipW(label: string): number {
  return Math.max(58, Math.min(190, label.length * 7.2 + 20));
}

/** Cluster-by-kind seed + a short force relaxation. Pure and deterministic.
 *  Pinned nodes are placed at their pin and never moved — the rest settle
 *  around them. */
function layout(nodes: Node[], edges: Edge[], pins: Record<string, NormPin>): Record<string, Pos> {
  const rand = mulberry32(42);
  const kinds = [...new Set(nodes.map((n) => n.kind))];
  const centers = new Map<string, Pos>();
  kinds.forEach((k, i) => {
    const a = (i / Math.max(1, kinds.length)) * Math.PI * 2 - Math.PI / 2;
    centers.set(k, { x: W / 2 + Math.cos(a) * W * 0.28, y: H / 2 + Math.sin(a) * H * 0.3 });
  });
  const pos: Record<string, Pos> = {};
  const fixed = new Set<string>();
  const perKind = new Map<string, number>();
  for (const n of nodes) {
    const pin = pins[n.id];
    if (pin) {
      pos[n.id] = { x: pin.x * W, y: pin.y * H };
      fixed.add(n.id);
      continue;
    }
    const i = perKind.get(n.kind) ?? 0;
    perKind.set(n.kind, i + 1);
    const c = centers.get(n.kind)!;
    const r = 26 + 15 * Math.sqrt(i);
    const a = i * 2.399963 + rand() * 0.5; // golden angle spiral
    pos[n.id] = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.75 };
  }
  // Relaxation: pairwise repulsion + springs along edges + soft centering.
  const ids = nodes.map((n) => n.id);
  for (let it = 0; it < 140; it++) {
    const f = new Map<string, Pos>(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]], b = pos[ids[j]];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = rand() - 0.5; dy = rand() - 0.5; d2 = 1; }
        const rep = 5200 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * rep, fy = (dy / d) * rep;
        const fa = f.get(ids[i])!, fb = f.get(ids[j])!;
        fa.x += fx; fa.y += fy; fb.x -= fx; fb.y -= fy;
      }
    }
    for (const e of edges) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const pull = (d - 130) * 0.012;
      const fx = (dx / d) * pull, fy = (dy / d) * pull;
      const fa = f.get(e.from)!, fb = f.get(e.to)!;
      fa.x += fx; fa.y += fy; fb.x -= fx; fb.y -= fy;
    }
    const damp = 1 - it / 160;
    for (const id of ids) {
      if (fixed.has(id)) continue;
      const p = pos[id], ff = f.get(id)!;
      p.x += (ff.x + (W / 2 - p.x) * 0.004) * damp;
      p.y += (ff.y + (H / 2 - p.y) * 0.004) * damp;
      p.x = Math.max(70, Math.min(W - 70, p.x));
      p.y = Math.max(28, Math.min(H - 28, p.y));
    }
  }
  return pos;
}

export function KnowledgeGraphView({ entities, onOpen }: { entities: KnowledgeEntityView[]; onOpen?: (id: string) => void }) {
  // Curation state. Pins merge the persisted layer (entities.graph_pin) with
  // this session's edits; collapse is session-local by design (a reading mode,
  // not data).
  const [pinOverrides, setPinOverrides] = useState<Record<string, NormPin | null>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const pins = useMemo(() => {
    const m: Record<string, NormPin> = {};
    for (const e of entities) if (e.graphPin) m[e.id] = e.graphPin;
    for (const [id, p] of Object.entries(pinOverrides)) {
      if (p) m[id] = p;
      else delete m[id];
    }
    return m;
  }, [entities, pinOverrides]);

  /** Persist a pin (or null to unpin). Optimistic — the canvas is already right. */
  const persistPin = (id: string, pin: NormPin | null) => {
    setPinOverrides((prev) => ({ ...prev, [id]: pin }));
    fetch(`/api/knowledge/entities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graphPin: pin }),
    }).catch((err) => console.error("[graph] pin save failed", err));
  };

  // Top entities by connectivity; everything else is summarized in the footer.
  // Collapsed kinds fold into one hypernode each, edges rerouted + deduped.
  const { nodes, edges, hidden, kindCounts } = useMemo(() => {
    const picked = [...entities].sort((a, b) => b.edges - a.edges).slice(0, MAX_NODES);
    const idSet = new Set(picked.map((e) => e.id));
    const counts = new Map<string, number>();
    for (const e of picked) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);

    const folded = (kind: string) => collapsed.has(kind) && (counts.get(kind) ?? 0) >= 2;
    const displayId = (e: KnowledgeEntityView) => (folded(e.kind) ? hyperId(e.kind) : e.id);
    const byId = new Map(picked.map((e) => [e.id, e]));

    const ns: Node[] = [];
    const madeHyper = new Set<string>();
    for (const e of picked) {
      if (folded(e.kind)) {
        if (!madeHyper.has(e.kind)) {
          madeHyper.add(e.kind);
          ns.push({ id: hyperId(e.kind), label: `${titleCase(plural(e.kind))} (${counts.get(e.kind)})`, kind: e.kind, hyper: true, count: counts.get(e.kind) });
        }
      } else {
        ns.push({ id: e.id, label: e.label, kind: e.kind, entity: e });
      }
    }

    const es: Edge[] = [];
    const seen = new Set<string>();
    for (const e of picked) {
      for (const f of e.facts) {
        if (f.ref && f.refId && idSet.has(f.refId) && f.refId !== e.id) {
          const from = displayId(e);
          const to = displayId(byId.get(f.refId)!);
          if (from === to) continue; // folded into the same hypernode
          const key = `${from}~${to}~${f.predicate}`;
          if (!seen.has(key)) { seen.add(key); es.push({ from, to, predicate: f.predicate }); }
        }
      }
    }
    return { nodes: ns, edges: es, hidden: entities.length - picked.length, kindCounts: counts };
  }, [entities, collapsed]);

  const seeded = useMemo(() => layout(nodes, edges, pins), [nodes, edges, pins]);
  const [pos, setPos] = useState<Record<string, Pos>>(seeded);
  useEffect(() => setPos(seeded), [seeded]);

  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string | null; dx: number; dy: number; moved: boolean }>({ id: null, dx: 0, dy: 0, moved: false });

  const toggleCollapse = (kind: string) => {
    setSelected(null);
    setHover(null);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set([n.id])]));
    for (const e of edges) { m.get(e.from)?.add(e.to); m.get(e.to)?.add(e.from); }
    return m;
  }, [nodes, edges]);

  const focus = hover ?? selected;
  const nodeActive = (id: string) => !focus || neighbors.get(focus)?.has(id);
  const edgeActive = (e: Edge) => !!focus && (e.from === focus || e.to === focus);

  const toSVG = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const onNodeDown = (ev: PointerEvent, id: string) => {
    ev.stopPropagation();
    const p = toSVG(ev.clientX, ev.clientY);
    drag.current = { id, dx: pos[id].x - p.x, dy: pos[id].y - p.y, moved: false };
    setDragId(id);
    try { svgRef.current!.setPointerCapture(ev.pointerId); } catch { /* older browsers */ }
  };
  const onMove = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d.id) return;
    const p = toSVG(ev.clientX, ev.clientY);
    d.moved = true;
    const nx = Math.max(60, Math.min(W - 60, p.x + d.dx));
    const ny = Math.max(24, Math.min(H - 24, p.y + d.dy));
    setPos((prev) => ({ ...prev, [d.id!]: { x: nx, y: ny } }));
  };
  const onUp = (ev: PointerEvent) => {
    const d = drag.current;
    if (d.id) {
      const node = nodes.find((n) => n.id === d.id);
      if (!d.moved) {
        if (node?.hyper) toggleCollapse(node.kind); // expand on click
        else setSelected((s) => (s === d.id ? null : d.id));
      } else if (node && !node.hyper) {
        // Dropping a node pins it there — the graph remembers.
        const p = pos[d.id];
        if (p) persistPin(d.id, { x: p.x / W, y: p.y / H });
      }
    }
    drag.current = { id: null, dx: 0, dy: 0, moved: false };
    setDragId(null);
    try { svgRef.current!.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
  };

  const sel = selected ? nodes.find((n) => n.id === selected && n.entity) : null;
  const selLinks = sel
    ? nodes.filter((n) => n.id !== sel.id && !n.hyper && neighbors.get(sel.id)?.has(n.id))
    : [];

  if (nodes.length === 0) {
    return <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "28px 4px" }}>Nothing to draw yet — entities appear here as your agents read messages.</div>;
  }

  const kicker: CSSProperties = { fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" };
  const clusterable = [...kindCounts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ position: "relative", background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
      {/* cluster chips — fold a whole kind into one hypernode */}
      {clusterable.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "10px 14px 0" }}>
          <span className="dm-mono" style={kicker}>clusters</span>
          {clusterable.map(([kind, n]) => {
            const on = collapsed.has(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleCollapse(kind)}
                aria-pressed={on}
                title={on ? `Expand ${plural(kind)} back into ${n} nodes` : `Collapse ${n} ${plural(kind)} into one node`}
                className="dm-mono"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer",
                  border: `1px solid ${on ? toneOf(kind) : "#E1D9C8"}`, borderRadius: 999, padding: "3px 10px",
                  background: on ? "#FBF8F1" : "#fff", color: on ? toneOf(kind) : "#8A8477",
                }}
              >
                <span style={{ fontSize: 9 }}>{on ? "▸" : "▾"}</span> {titleCase(plural(kind))} <span style={{ opacity: 0.7 }}>×{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Knowledge graph — drag entities to pin them in place, click to inspect"
        style={{ display: "block", fontSize: 12, touchAction: "none", cursor: dragId ? "grabbing" : "default" }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerDown={() => selected && setSelected(null)}
        onMouseLeave={() => setHover(null)}
      >
        {/* edges */}
        {edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to];
          if (!a || !b) return null;
          const active = edgeActive(e);
          const dim = focus && !active;
          return (
            <g key={i} style={{ opacity: dim ? 0.18 : 1, transition: dragId ? "none" : "opacity .18s ease" }}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={active ? C.accent : "#DDD5C5"}
                strokeWidth={active ? 2 : 1.25}
                strokeLinecap="round"
              />
              {active && (
                <text
                  x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6}
                  textAnchor="middle"
                  className="dm-mono"
                  style={{ fontSize: 9.5, fill: C.accent, letterSpacing: "0.03em", paintOrder: "stroke", stroke: "#FFFDF8", strokeWidth: 3 }}
                >
                  {e.predicate.replace(/_/g, " ")}
                </text>
              )}
            </g>
          );
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const p = pos[n.id];
          if (!p) return null;
          const w = chipW(n.label) + (n.hyper ? 12 : 0);
          const h = n.hyper ? CHIP_H + 8 : CHIP_H;
          const tone = toneOf(n.kind);
          const active = nodeActive(n.id);
          const focused = focus === n.id;
          const dragging = dragId === n.id;
          const isSel = selected === n.id;
          const isPinned = !n.hyper && Boolean(pins[n.id]);
          return (
            <g
              key={n.id}
              tabIndex={0}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
              onPointerDown={(ev) => onNodeDown(ev, n.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  if (n.hyper) toggleCollapse(n.kind);
                  else setSelected((s) => (s === n.id ? null : n.id));
                }
              }}
              style={{
                cursor: dragging ? "grabbing" : "grab",
                outline: "none",
                opacity: active ? 1 : 0.3,
                transform: `translate(${p.x}px, ${p.y}px) scale(${dragging ? 1.1 : focused ? 1.06 : 1})`,
                transformBox: "fill-box",
                transformOrigin: "center",
                transition: dragging ? "none" : "opacity .18s ease, transform .25s cubic-bezier(0.34,1.32,0.5,1)",
              }}
            >
              <title>{n.hyper ? `${n.count} ${plural(n.kind)} — click to expand` : isPinned ? `${n.label} — pinned` : n.label}</title>
              {isSel && (
                <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} rx={(h + 6) / 2} fill="none" stroke={C.accent} strokeWidth={1.5} />
              )}
              {n.hyper && (
                <rect x={-w / 2 + 3} y={-h / 2 + 5} width={w} height={h} rx={h / 2} fill="none" stroke={`${tone}66`} strokeWidth={1.25} />
              )}
              <rect
                x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2}
                fill={n.hyper ? "#FBF8F1" : "#fff"} stroke={n.hyper ? tone : focused ? tone : "#E7E0D2"} strokeWidth={n.hyper ? 1.5 : focused ? 1.5 : 1}
                style={{ filter: dragging ? "drop-shadow(0 14px 26px rgba(33,30,24,.28))" : focused ? "drop-shadow(0 8px 16px rgba(33,30,24,.18))" : "drop-shadow(0 4px 10px rgba(33,30,24,.08))", transition: "filter .18s ease" }}
              />
              {n.hyper
                ? <text x={-w / 2 + 13} y={1} dominantBaseline="middle" style={{ fontSize: 11, fill: tone, pointerEvents: "none" }}>▣</text>
                : <circle cx={-w / 2 + 14} cy={0} r={4.5} fill={tone} />}
              <text
                x={7} y={1} textAnchor="middle" dominantBaseline="middle"
                style={{ fontWeight: n.hyper ? 700 : 600, fontSize: 12, fill: C.ink, letterSpacing: "-0.01em", pointerEvents: "none" }}
              >
                {n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label}
              </text>
              {isPinned && <circle cx={w / 2 - 9} cy={-h / 2 + 7} r={3} fill={C.accent} stroke="#fff" strokeWidth={1} />}
            </g>
          );
        })}
      </svg>

      {/* inspector — pinned when a node is clicked */}
      {sel?.entity && (
        <div className="dm-fade-in" style={{ position: "absolute", top: 12, right: 12, width: 240, maxHeight: "calc(100% - 24px)", overflowY: "auto", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 14, boxShadow: "0 18px 40px rgba(33,30,24,.16)", padding: "13px 14px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <span className="dm-mono" style={{ ...kicker, color: toneOf(sel.kind) }}>{sel.kind}</span>
            <button onClick={() => setSelected(null)} aria-label="Close inspector" style={{ border: "none", background: "transparent", color: "#A39B8B", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2 }}>×</button>
          </div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 16.5, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.15 }}>{sel.label}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {onOpen && (
              <button
                type="button"
                onClick={() => onOpen(sel.id)}
                className="dm-mono"
                style={{ fontSize: 10.5, color: C.ink, background: "#FBF8F1", border: "1px solid #E1D9C8", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
              >
                Open page ›
              </button>
            )}
            {pins[sel.id] && (
              <button
                type="button"
                onClick={() => persistPin(sel.id, null)}
                title="Let this node flow with the layout again"
                className="dm-mono"
                style={{ fontSize: 10.5, color: C.accent, background: "#FDF6F2", border: "1px solid #F3D6CB", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
              >
                ● Unpin
              </button>
            )}
          </div>
          {Object.entries(sel.entity.naturalKeys ?? {}).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {Object.entries(sel.entity.naturalKeys).map(([k, v]) => (
                <span key={k} className="dm-mono" style={{ fontSize: 10, color: "#57534A", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 6, padding: "2px 6px" }}>{k.replace(/_/g, " ")}: {v}</span>
              ))}
            </div>
          )}
          {sel.entity.facts.filter((f) => !f.ref).length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
              {sel.entity.facts.filter((f) => !f.ref).slice(0, 8).map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12 }}>
                  <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", whiteSpace: "nowrap" }}>{f.predicate.replace(/_/g, " ")}</span>
                  <span style={{ color: "#3A352C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.value}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid #EFE9DC" }}>
            <div className="dm-mono" style={{ ...kicker, marginBottom: 7 }}>{selLinks.length} link{selLinks.length === 1 ? "" : "s"}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {selLinks.map((c) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setHover(c.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected(c.id)}
                  style={{ border: "1px solid #E1D9C8", background: "#FBF8F1", borderRadius: 999, padding: "3px 9px", fontSize: 11, color: "#514C43", cursor: "pointer", fontFamily: "inherit" }}
                >
                  {c.label}
                </button>
              ))}
              {selLinks.length === 0 && <span style={{ fontSize: 11.5, color: "#A39B8B" }}>No relationships yet.</span>}
            </div>
          </div>
        </div>
      )}

      {/* footer hint */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderTop: "1px solid #EFE9DC", background: "#FBF8F1" }}>
        <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" }}>
          Drag to pin in place · click to inspect
        </span>
        <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: "#A39B8B" }}>
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · {edges.length} link{edges.length === 1 ? "" : "s"}
          {(() => { const n = nodes.filter((x) => !x.hyper && pins[x.id]).length; return n > 0 ? ` · ${n} pinned` : ""; })()}
          {hidden > 0 ? ` · ${hidden} least-connected hidden` : ""}
        </span>
      </div>
    </div>
  );
}
