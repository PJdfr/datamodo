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

function NodeCard({ n }: { n: Placed }) {
  const ghost = n.role === "ghost";
  const fade = n.role === "fade";
  const value = n.role === "value" || n.key.startsWith("val:");
  return (
    <g transform={`translate(${n.x - NODE_W / 2}, ${n.y - NODE_H / 2})`} opacity={fade ? 0.38 : 1}>
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={value ? 21 : 10}
        fill={n.role === "center" ? "#fff" : "#FCFAF4"}
        stroke={ghost ? C.accent : fade ? "#C7362C" : n.role === "center" ? C.ink : "#E1D9C8"}
        strokeWidth={n.role === "center" ? 1.4 : 1}
        strokeDasharray={ghost || fade ? "5 4" : undefined}
      />
      <text
        x={NODE_W / 2}
        y={17}
        textAnchor="middle"
        style={{ font: `600 12px var(--font-geist-sans, sans-serif)`, fill: C.ink }}
        textDecoration={fade && !value ? "line-through" : undefined}
      >
        {n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label}
      </text>
      <text
        x={NODE_W / 2}
        y={32}
        textAnchor="middle"
        style={{ font: `500 8.5px var(--font-geist-mono, monospace)`, fill: "#A39B8B", letterSpacing: "0.05em", textTransform: "uppercase" as const }}
      >
        {n.kind}
      </text>
    </g>
  );
}

function Scene({ scene }: { scene: PreviewScene }) {
  const placed = useMemo(() => layout(scene), [scene]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="graph preview">
      {scene.edges.map((e, i) => {
        const a = placed.get(e.from);
        const b = placed.get(e.to);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - 7;
        return (
          <g key={i} opacity={e.state === "drop" ? 0.45 : 1}>
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={edgeTone[e.state]}
              strokeWidth={e.state === "add" ? 1.8 : 1.3}
              strokeDasharray={e.state === "drop" ? "4 4" : e.state === "add" ? "1 0" : undefined}
            />
            <text x={mx} y={my} textAnchor="middle" style={{ font: `500 8.5px var(--font-geist-mono, monospace)`, fill: e.state === "add" ? C.accent : "#A39B8B" }}>
              {e.predicate.replace(/_/g, " ")}
            </text>
          </g>
        );
      })}
      {[...placed.values()].map((n) => <NodeCard key={n.key} n={n} />)}
    </svg>
  );
}

export function ReviewGraphModal({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
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
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(33,30,24,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", background: "#F6F2E9", border: "1px solid #E1D9C8", borderRadius: 18, boxShadow: "0 24px 60px rgba(33,30,24,0.25)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid #ECE5D8" }}>
          <span style={{ color: C.accent, fontSize: 14 }}>◍</span>
          <span className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: C.ink }}>What this decision does to your graph</span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", fontFamily: "inherit", fontSize: 15, color: "#8A8477", background: "none", border: "none", cursor: "pointer", padding: 4 }}>✕</button>
        </div>
        <div style={{ background: "#FBF8F1", margin: "14px 18px 0", border: "1px solid #ECE5D8", borderRadius: 14 }}>
          <Scene scene={scene} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px 16px" }}>
          {seg("accept", "✓ if you accept", C.green)}
          {seg("refuse", "✕ if you refuse", "#C7362C")}
          <span style={{ fontSize: 12, color: "#57534A", lineHeight: 1.45, marginLeft: 6 }}>{scene.note}</span>
        </div>
      </div>
    </div>
  );
}
