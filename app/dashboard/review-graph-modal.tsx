"use client";

/**
 * REVIEW GRAPH PREVIEW — one review row, two futures. Opens from a queue
 * row's "◍" and shows the mini graph scene for THAT decision: "if you
 * accept" vs "if you refuse" (entity_merge / orphan_prune / fact_conflict —
 * the graph-shaped kinds). Scenes come from the pure core
 * (lib/datamodo/review-preview.ts); this file only lays them out.
 *
 * Layout is deterministic (fixed positions, no physics — the Explorer's
 * standing rule): centers on the midline, neighbors fanned outward, the
 * ghost above, value nodes to the right. Both futures render the SAME nodes
 * where possible so toggling reads as the change, not a new picture.
 */

import { useEffect, useMemo, useState } from "react";
import { C } from "./ui";
import type { ReviewItem } from "@/lib/datamodo/review-types";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import {
  buildReviewPreview,
  type PreviewNode,
  type PreviewScene,
  type ReviewPreviewInput,
} from "@/lib/datamodo/review-preview";

/** ReviewItem → pure-core input; null = this kind has no graph preview. */
export function previewInputFor(item: ReviewItem): ReviewPreviewInput | null {
  if (item.kind === "entity_merge") {
    return {
      kind: "entity_merge",
      sourceEntityId: item.sourceEntityId,
      sourceLabel: item.parsed.label,
      targetEntityId: item.targetEntityId,
      targetLabel: item.canonical.label,
    };
  }
  if (item.kind === "orphan_prune") {
    return { kind: "orphan_prune", orphans: item.entities.map((e) => ({ id: e.id, label: e.label, kind: e.type })) };
  }
  if (item.kind === "fact_conflict") {
    return {
      kind: "fact_conflict",
      subjectEntityId: item.subjectEntityId,
      subjectLabel: item.subject,
      predicate: item.field,
      was: item.was,
      now: item.now,
    };
  }
  return null;
}

const W = 680;
const H = 380;
const NODE_W = 148;
const NODE_H = 42;

interface Placed extends PreviewNode {
  x: number;
  y: number;
}

/** Fixed positions: centers on the midline, neighbors fanned outward from
 *  their center, ghost top-center, value nodes stacked right. */
function layout(scene: PreviewScene): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  const centers = scene.nodes.filter((n) => n.role === "center");
  const values = scene.nodes.filter((n) => n.role === "value" || (n.key.startsWith("val:") && n.role === "fade"));
  const ghost = scene.nodes.find((n) => n.role === "ghost");
  const plain = scene.nodes.filter((n) => !centers.includes(n) && !values.includes(n) && n !== ghost);

  if (centers.length === 0) {
    // Orphan grid: rows of chips.
    plain.forEach((n, i) => {
      placed.set(n.key, { ...n, x: 90 + (i % 3) * 200, y: 80 + Math.floor(i / 3) * 90 });
    });
    return placed;
  }
  centers.forEach((c, i) => {
    const x = centers.length === 1 ? W / 2 - 60 : 170 + i * (W - 340);
    placed.set(c.key, { ...c, x, y: H / 2 });
  });
  if (ghost) placed.set(ghost.key, { ...ghost, x: W / 2 - 60, y: 58 });
  values.forEach((v, i) => placed.set(v.key, { ...v, x: W - 190, y: H / 2 - 70 + i * 130 }));

  // Attach each neighbor to the first center an edge ties it to; fan outward.
  const perCenter = new Map<string, PreviewNode[]>();
  for (const n of plain) {
    const edge = scene.edges.find((e) => e.to === n.key || e.from === n.key);
    const centerKey =
      centers.find((c) => c.key === edge?.from || c.key === edge?.to)?.key ?? centers[0].key;
    perCenter.set(centerKey, [...(perCenter.get(centerKey) ?? []), n]);
  }
  for (const [ck, list] of perCenter) {
    const c = placed.get(ck)!;
    const leftSide = centers.length > 1 && c.x < W / 2;
    list.forEach((n, i) => {
      const spread = list.length > 1 ? i / (list.length - 1) - 0.5 : 0;
      const y = H / 2 + spread * Math.min(260, list.length * 78);
      const x = centers.length === 1 ? (i % 2 === 0 ? c.x - 230 : c.x + 230) : leftSide ? c.x - 150 : c.x + 150;
      placed.set(n.key, { ...n, x, y });
    });
  }
  return placed;
}

const edgeTone = { keep: "#D8D2C4", add: C.accent, drop: "#C7362C" } as const;

/** The Explorer walk's card grammar (kind dot + uppercase mono kicker +
 *  label, paper-warm wash, its exact shadow) as a positioned DOM card —
 *  same UI as the graph Explorer, per the user call. Ghost/fade reuse the
 *  walk's dashed-cluster look. */
function NodeCard({ n }: { n: Placed }) {
  const ghost = n.role === "ghost";
  const fade = n.role === "fade";
  const center = n.role === "center";
  return (
    <div style={{
      position: "absolute", left: n.x - NODE_W / 2, top: n.y - NODE_H / 2, width: NODE_W,
      background: ghost || fade ? "#FBF8F1" : center ? "#FFFDF8" : "#FCFAF4",
      border: ghost ? `1.5px dashed ${C.accent}` : fade ? "1.5px dashed #C7362C" : `1px solid ${center ? C.accent : "#E7E0D2"}`,
      borderRadius: center ? 16 : 14,
      padding: center ? "9px 12px" : "7px 10px",
      boxShadow: ghost || fade ? "none" : center
        ? "0 30px 60px -28px rgba(33,30,24,.5), 0 6px 16px -8px rgba(33,30,24,.22)"
        : "0 18px 44px -30px rgba(33,30,24,.4)",
      opacity: fade ? 0.45 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 2, background: fade ? "#C7362C" : C.accent, flexShrink: 0 }} />
        <span className="dm-mono" style={{ fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#A39B8B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.kind}</span>
      </div>
      <div className="dm-display" style={{ fontWeight: 700, fontSize: center ? 13.5 : 12, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: fade && !n.key.startsWith("val:") ? "line-through" : undefined }}>
        {n.label}
      </div>
    </div>
  );
}

function Scene({ scene }: { scene: PreviewScene }) {
  const placed = useMemo(() => layout(scene), [scene]);
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: `${W} / ${H}` }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "top left", containerType: "size" }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
          {scene.edges.map((e, i) => {
            const a = placed.get(e.from);
            const b = placed.get(e.to);
            if (!a || !b) return null;
            return (
              <g key={i} opacity={e.state === "drop" ? 0.45 : 1}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={edgeTone[e.state]} strokeWidth={e.state === "add" ? 1.8 : 1.3}
                  strokeDasharray={e.state === "drop" ? "4 4" : undefined} />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 7} textAnchor="middle"
                  style={{ font: `500 8.5px var(--font-geist-mono, monospace)`, fill: e.state === "add" ? C.accent : "#A39B8B" }}>
                  {e.predicate.replace(/_/g, " ")}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0 }}>
          {/* Cards scale with the box via percentage positioning. */}
          {[...placed.values()].map((n) => (
            <div key={n.key} style={{ position: "absolute", left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%`, transform: "translate(-50%, -50%)" }}>
              <NodeCard n={{ ...n, x: NODE_W / 2, y: NODE_H / 2 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Inline per-row panel (user call 2026-07-16: the graph shows NEXT TO the
 *  clicked row, not in a modal): the decision's two futures, toggled. */
export function ReviewGraphPanel({ item }: { item: ReviewItem }) {
  const [views, setViews] = useState<KnowledgeEntityView[]>([]);
  const [future, setFuture] = useState<"accept" | "refuse">("accept");

  useEffect(() => {
    let alive = true;
    fetch("/api/knowledge/entities")
      .then((r) => r.json())
      .then((j) => { if (alive) setViews(j.entities ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const input = previewInputFor(item);
  const preview = useMemo(() => (input ? buildReviewPreview(views, input) : null), [views, input]);
  if (!preview) return null;
  const scene = preview[future];

  const seg = (key: "accept" | "refuse", label: string, tone: string) => (
    <button
      onClick={() => setFuture(key)}
      style={{
        fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
        padding: "6px 14px", borderRadius: 9,
        border: `1px solid ${future === key ? tone : "#E1D9C8"}`,
        background: future === key ? tone : "#fff",
        color: future === key ? "#fff" : "#57534A",
        transition: "all .14s ease",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderBottom: "1px solid #F1EDE4" }}>
        <span style={{ color: C.accent, fontSize: 12 }}>◍</span>
        <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" }}>what this does to your graph</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {seg("accept", "✓ accept", C.green)}
          {seg("refuse", "✕ refuse", "#C7362C")}
        </span>
      </div>
      <div style={{ background: "#FBF8F1", flex: 1 }}>
        <Scene scene={scene} />
      </div>
      <div style={{ fontSize: 11.5, color: "#57534A", lineHeight: 1.45, padding: "8px 13px 10px", borderTop: "1px solid #F1EDE4" }}>{scene.note}</div>
    </div>
  );
}
