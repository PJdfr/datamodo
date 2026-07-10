"use client";

/**
 * The plain-language answer at the top of Search results, grounded in the
 * user's own data: [n] citations render as clickable chips that jump to the
 * cited row's table, and every source is listed beneath the prose. Shown only
 * when the model actually cited its sources (lib/datamodo/answer.ts enforces
 * that) — no citations, no card.
 */

import { Fragment } from "react";
import { C } from "./ui";
import type { GroundedAnswer } from "@/lib/datamodo/answer";

export function AnswerCard({ answer, onOpenTable }: { answer: GroundedAnswer; onOpenTable: (id: string) => void }) {
  const byN = new Map(answer.sources.map((s) => [s.n, s]));
  const parts = answer.text.split(/(\[\d+\])/g);
  return (
    <div className="dm-card dm-rise" style={{ background: "linear-gradient(#FDF9F2,#FCF5EC)", border: "1px solid #F0DFC8", borderRadius: 14, padding: "15px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: C.accent, fontSize: 14 }}>✦</span>
        <span className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" }}>Answer · from your own data</span>
      </div>
      <div style={{ fontSize: 15.5, color: C.ink, lineHeight: 1.55 }}>
        {parts.map((p, i) => {
          const m = /^\[(\d+)\]$/.exec(p);
          const src = m ? byN.get(Number(m[1])) : undefined;
          if (!src) return <Fragment key={i}>{p}</Fragment>;
          return (
            <button
              key={i}
              type="button"
              onClick={src.datasetId ? () => onOpenTable(src.datasetId!) : undefined}
              title={src.label}
              className="dm-mono"
              style={{ fontSize: 10, fontWeight: 600, color: C.accent, background: "#FDF1EC", border: "1px solid #F3D6CB", borderRadius: 5, padding: "1px 5px", margin: "0 2px", cursor: src.datasetId ? "pointer" : "default", verticalAlign: "text-top" }}
            >{m![1]}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
        {answer.sources.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={s.datasetId ? () => onOpenTable(s.datasetId!) : undefined}
            className="dm-mono"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#57534A", background: "#fff", border: "1px solid #EBE2D2", borderRadius: 6, padding: "3px 8px", cursor: s.datasetId ? "pointer" : "default", fontFamily: "inherit" }}
          >
            <span style={{ color: C.accent, fontWeight: 600 }}>{s.n}</span>
            {s.type === "row" ? "▤" : "◍"} {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
