"use client";

/**
 * CONCEPT MAP — the map of content: one zoom level above the entity graph.
 * Nodes are CONCEPTS only, sized by how much content is about them; solid
 * edges are explicit `related_to` facts, dashed edges are co-occurrence (the
 * same document/note is about both). Click a concept to see its content and
 * jump to any piece's page. Derived live from the same entities the Knowledge
 * tab already holds — pure projection (lib/datamodo/concept-map.ts).
 */

import { useMemo, useState, type CSSProperties } from "react";
import { C } from "./ui";
import { buildConceptMap, type ConceptNode } from "@/lib/datamodo/concept-map";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";

const W = 920;
const H = 480;

const KIND_GLYPH: Record<string, string> = { document: "▤", note: "✎", invoice: "◫", event: "◷" };

/** Deterministic PRNG — same layout on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pos = { x: number; y: number };

/** Weight-ordered golden-angle spiral from the center + a short relaxation. */
function layout(nodes: ConceptNode[], links: { a: string; b: string }[], radius: (n: ConceptNode) => number): Record<string, Pos> {
  const rand = mulberry32(7);
  const pos: Record<string, Pos> = {};
  nodes.forEach((n, i) => {
    const r = 40 + 52 * Math.sqrt(i);
    const a = i * 2.399963 + rand() * 0.4;
    pos[n.id] = { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r * 0.62 };
  });
  const ids = nodes.map((n) => n.id);
  const rOf = new Map(nodes.map((n) => [n.id, radius(n)]));
  for (let it = 0; it < 120; it++) {
    const f = new Map<string, Pos>(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]], b = pos[ids[j]];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = rand() - 0.5; dy = rand() - 0.5; d2 = 1; }
        const min = (rOf.get(ids[i])! + rOf.get(ids[j])!) * 2.4;
        const rep = (3600 + min * min * 0.35) / d2;
        const d = Math.sqrt(d2);
        const fa = f.get(ids[i])!, fb = f.get(ids[j])!;
        fa.x += (dx / d) * rep; fa.y += (dy / d) * rep;
        fb.x -= (dx / d) * rep; fb.y -= (dy / d) * rep;
      }
    }
    for (const e of links) {
      const a = pos[e.a], b = pos[e.b];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const pull = (d - 170) * 0.01;
      const fa = f.get(e.a)!, fb = f.get(e.b)!;
      fa.x += (dx / d) * pull; fa.y += (dy / d) * pull;
      fb.x -= (dx / d) * pull; fb.y -= (dy / d) * pull;
    }
    const damp = 1 - it / 140;
    for (const id of ids) {
      const p = pos[id], ff = f.get(id)!;
      p.x += (ff.x + (W / 2 - p.x) * 0.006) * damp;
      p.y += (ff.y + (H / 2 - p.y) * 0.006) * damp;
      const m = rOf.get(id)! + 26;
      p.x = Math.max(m, Math.min(W - m, p.x));
      p.y = Math.max(m + 6, Math.min(H - m - 14, p.y));
    }
  }
  return pos;
}

export function ConceptMapView({ entities, onOpen }: { entities: KnowledgeEntityView[]; onOpen?: (id: string) => void }) {
  const map = useMemo(() => buildConceptMap(entities), [entities]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const radius = (n: ConceptNode) => Math.min(30, 11 + 5 * Math.sqrt(n.items.length));
  const pos = useMemo(() => layout(map.concepts, map.links, radius), [map]);

  if (map.concepts.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 20px", background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 22 }}>◌</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em", margin: "0 0 6px" }}>No concepts yet</h2>
        <p style={{ fontSize: 13.5, color: "#57534A", maxWidth: "46ch", margin: 0, lineHeight: 1.55 }}>
          When documents and notes land, we tag each with up to three topics. Those topics become this map — a table of contents that assembles itself.
        </p>
      </div>
    );
  }

  const neighbors = new Map<string, Set<string>>(map.concepts.map((c) => [c.id, new Set([c.id])]));
  for (const l of map.links) { neighbors.get(l.a)?.add(l.b); neighbors.get(l.b)?.add(l.a); }
  const focus = hover ?? selected;
  const dimmed = (id: string) => Boolean(focus && !neighbors.get(focus)?.has(id));

  const sel = selected ? map.concepts.find((c) => c.id === selected) : null;
  const kicker: CSSProperties = { fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" };

  return (
    <div style={{ position: "relative", background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 16, overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Concept map — topics sized by how much content is about them" style={{ display: "block" }} onPointerDown={() => setSelected(null)}>
        {map.links.map((l, i) => {
          const a = pos[l.a], b = pos[l.b];
          if (!a || !b) return null;
          const active = focus === l.a || focus === l.b;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? C.accent : "#DDD5C5"}
              strokeWidth={Math.min(3.5, 1 + l.shared * 0.75)}
              strokeDasharray={l.explicit ? undefined : "4 5"}
              strokeLinecap="round"
              style={{ opacity: focus && !active ? 0.15 : 1, transition: "opacity .18s ease" }}
            />
          );
        })}
        {map.concepts.map((c) => {
          const p = pos[c.id];
          if (!p) return null;
          const r = radius(c);
          const focused = focus === c.id;
          return (
            <g
              key={c.id}
              tabIndex={0}
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.id)}
              onBlur={() => setHover(null)}
              onPointerDown={(ev) => { ev.stopPropagation(); setSelected((s) => (s === c.id ? null : c.id)); }}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelected((s) => (s === c.id ? null : c.id)); } }}
              style={{ cursor: "pointer", outline: "none", opacity: dimmed(c.id) ? 0.25 : 1, transition: "opacity .18s ease" }}
            >
              <title>{`${c.label} — ${c.items.length} piece${c.items.length === 1 ? "" : "s"} of content`}</title>
              <circle cx={p.x} cy={p.y} r={r + (focused ? 3 : 0)} fill={focused ? "#FDF6F2" : "#fff"} stroke={focused ? C.accent : "#D9CFBC"} strokeWidth={focused ? 1.75 : 1.25} style={{ filter: focused ? "drop-shadow(0 8px 16px rgba(33,30,24,.18))" : "drop-shadow(0 3px 8px rgba(33,30,24,.08))", transition: "all .18s ease" }} />
              {c.items.length > 0 && (
                <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle" className="dm-mono" style={{ fontSize: Math.min(13, 9 + r * 0.12), fill: focused ? C.accent : "#8A8477", pointerEvents: "none" }}>
                  {c.items.length}
                </text>
              )}
              <text x={p.x} y={p.y + r + 13} textAnchor="middle" style={{ fontWeight: 600, fontSize: 12, fill: C.ink, letterSpacing: "-0.01em", paintOrder: "stroke", stroke: "#FFFDF8", strokeWidth: 3, pointerEvents: "none" }}>
                {c.label.length > 26 ? c.label.slice(0, 25) + "…" : c.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* drawer — the content that is about the selected concept */}
      {sel && (
        <div className="dm-fade-in" style={{ position: "absolute", top: 12, right: 12, width: 250, maxHeight: "calc(100% - 24px)", overflowY: "auto", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 14, boxShadow: "0 18px 40px rgba(33,30,24,.16)", padding: "13px 14px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <span className="dm-mono" style={{ ...kicker, color: C.accent }}>concept</span>
            <button onClick={() => setSelected(null)} aria-label="Close" style={{ border: "none", background: "transparent", color: "#A39B8B", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2 }}>×</button>
          </div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 16.5, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.15 }}>{sel.label}</div>
          <div className="dm-mono" style={{ ...kicker, margin: "10px 0 6px" }}>{sel.items.length ? `about this (${sel.items.length})` : "about this"}</div>
          <div style={{ display: "grid", gap: 5 }}>
            {sel.items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={onOpen ? () => onOpen(it.id) : undefined}
                title="Open its page"
                style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", border: "1px solid #ECE5D8", background: "#FCFAF4", borderRadius: 9, padding: "6px 9px", cursor: onOpen ? "pointer" : "default", fontFamily: "inherit" }}
              >
                <span style={{ fontSize: 12, color: "#8A8477", flexShrink: 0 }}>{KIND_GLYPH[it.kind] ?? "◍"}</span>
                <span style={{ minWidth: 0, flex: 1, fontSize: 12, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                <span className="dm-mono" style={{ fontSize: 9, color: "#B7AF9F", textTransform: "uppercase", flexShrink: 0 }}>{it.kind}</span>
              </button>
            ))}
            {sel.items.length === 0 && <span style={{ fontSize: 11.5, color: "#A39B8B" }}>Nothing filed here yet.</span>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderTop: "1px solid #EFE9DC", background: "#FBF8F1" }}>
        <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" }}>
          Sized by content · solid = related · dashed = shares content
        </span>
        <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: "#A39B8B" }}>
          {map.concepts.length} concept{map.concepts.length === 1 ? "" : "s"} · {map.links.length} link{map.links.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
