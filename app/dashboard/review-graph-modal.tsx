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
import { ExplorerView } from "./explorer-view";
import type { KindDef } from "@/lib/datamodo/ontology";
import { C } from "./ui";
import type { ReviewItem } from "@/lib/datamodo/review-types";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import { buildReviewPreview, futureViews, type ReviewPreviewInput } from "@/lib/datamodo/review-preview";

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

/** Inline per-row panel (user call 2026-07-16: the graph shows NEXT TO the
 *  clicked row, not in a modal): the decision's two futures, toggled. */
export function ReviewGraphPanel({ item }: { item: ReviewItem }) {
  const [views, setViews] = useState<KnowledgeEntityView[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [future, setFuture] = useState<"accept" | "refuse">("accept");

  useEffect(() => {
    let alive = true;
    fetch("/api/knowledge/entities")
      .then((r) => r.json())
      .then((j) => { if (alive) setViews(j.entities ?? []); })
      .catch(() => {});
    fetch("/api/kinds")
      .then((r) => r.json())
      .then((j) => { if (alive) setKinds(j.kinds ?? (Array.isArray(j) ? j : [])); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const kindByName = useMemo(() => new Map(kinds.map((k) => [k.kind, k])), [kinds]);

  const input = previewInputFor(item);
  const preview = useMemo(() => (input ? buildReviewPreview(views, input) : null), [views, input]);
  const fg = useMemo(() => (input ? futureViews(views, input, future) : null), [views, input, future]);
  if (!preview || !fg) return null;
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
      {/* THE REAL EXPLORER (same component, same code — user call): walking
          the TRANSFORMED graph of this future. Keyed by the future AND the
          center id: before the vault views load, the panel renders the
          label-only simulated world (sim:* ids) — when the real entities
          land, the center id changes and the walk must REMOUNT, or it stays
          centered on a node that no longer exists (fixed 2026-07-20: the
          panel was stuck on "that node isn't in your knowledge yet"). */}
      <div style={{ position: "relative", height: 420, background: "#FBF8F1" }}>
        {fg.centerId ? (
          <ExplorerView key={`${future}:${fg.centerId}`} entities={fg.views} initialId={fg.centerId} kindByName={kindByName} highlightIds={fg.highlightIds} />
        ) : (
          <div className="dm-mono" style={{ padding: 20, fontSize: 12, color: "#A39B8B" }}>Nothing left to walk — these nodes are gone in this future.</div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "#57534A", lineHeight: 1.45, padding: "8px 13px 10px", borderTop: "1px solid #F1EDE4" }}>{scene.note}</div>
    </div>
  );
}
