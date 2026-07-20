"use client";

/**
 * DEV TRACE VIEWER — full transparency on one message's trip through the
 * pipeline. Opens from the "⌁" pill on a chat bubble (dev mode only) and
 * renders the trace recorded by runExtractionForItem: every stage as a
 * timeline row (gate → routing → context assembly → LLM calls → storage →
 * reply), each expandable to its FULL payload — the exact system+user
 * prompts, the model's raw JSON answer, the primed entities with their
 * similarity scores, per-entity resolution tiers, per-fact outcomes.
 *
 * Brand: paper panel on a dimmed canvas, ink text, ONE coral accent (LLM
 * spend is what costs money — it gets the accent), all data in Geist Mono.
 */

import { useEffect, useState } from "react";
import { C } from "./ui";

interface TraceStep {
  t: number;
  ms?: number;
  stage: string;
  label: string;
  detail?: Record<string, unknown>;
}
interface TraceJson {
  version: 1;
  startedAt: string;
  totalMs: number;
  steps: TraceStep[];
  truncated?: boolean;
}
interface TraceResponse {
  enabled: boolean;
  item: { id: string; channel: string | null; sender: string | null; subject: string | null; status: string };
  trace: TraceJson | null;
}

/** Stage → tint. LLM calls carry the coral (that's the spend); storage is
 *  green (that's the vault); errors are loud; plumbing stays neutral. */
const STAGE_TONE: Record<string, { fg: string; bg: string }> = {
  llm: { fg: C.accent, bg: "#FBEAE5" },
  extract: { fg: C.accent, bg: "#FBEAE5" },
  store: { fg: C.green, bg: "#E8F2EC" },
  docs: { fg: C.blue, bg: "#EAEEF4" },
  embed: { fg: C.blue, bg: "#EAEEF4" },
  review: { fg: C.gold, bg: "#F6EEDC" },
  error: { fg: "#FFFDF8", bg: C.accent },
  done: { fg: C.green, bg: "#E8F2EC" },
};
const toneFor = (stage: string) => STAGE_TONE[stage] ?? { fg: "#6B6557", bg: "#F1EBDE" };

const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);

/** One detail value: long strings get a scrollable pre (prompts, replies);
 *  everything else pretty-prints as JSON. */
function DetailValue({ v }: { v: unknown }) {
  const text = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  const long = text.length > 200 || text.includes("\n");
  return (
    <pre
      className="dm-mono"
      style={{
        margin: 0,
        fontSize: 10.5,
        lineHeight: 1.55,
        color: "#3A352C",
        background: "#FBF8F1",
        border: "1px solid #ECE5D8",
        borderRadius: 8,
        padding: "8px 10px",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        maxHeight: long ? 320 : undefined,
        overflowY: long ? "auto" : undefined,
      }}
    >
      {text}
    </pre>
  );
}

function StepRow({ s }: { s: TraceStep }) {
  const [open, setOpen] = useState(false);
  const tone = toneFor(s.stage);
  const hasDetail = s.detail && Object.keys(s.detail).length > 0;
  return (
    <div style={{ borderBottom: "1px solid #EFE9DC" }}>
      <button
        onClick={() => hasDetail && setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "baseline", gap: 10, width: "100%", textAlign: "left",
          background: "none", border: "none", padding: "9px 6px", cursor: hasDetail ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", width: 58, flexShrink: 0, textAlign: "right" }}>
          +{fmtMs(s.t)}
        </span>
        <span
          className="dm-mono"
          style={{
            fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: tone.fg,
            background: tone.bg, borderRadius: 5, padding: "2px 7px", flexShrink: 0, width: 64, textAlign: "center",
          }}
        >
          {s.stage}
        </span>
        <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {s.label}
          {s.ms != null && (
            <span className="dm-mono" style={{ fontSize: 10, color: "#8A6D1F", marginLeft: 8 }}>{fmtMs(s.ms)}</span>
          )}
        </span>
        {hasDetail && (
          <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 10, color: "#A39B8B", flexShrink: 0 }}>
            {open ? "▾" : "▸"}
          </span>
        )}
      </button>
      {open && s.detail && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 6px 12px 132px" }}>
          {Object.entries(s.detail).map(([k, v]) =>
            v == null ? null : (
              <div key={k}>
                <div className="dm-mono" style={{ fontSize: 9.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "#8A8477", marginBottom: 3 }}>
                  {k}
                </div>
                <DetailValue v={v} />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function TraceModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [data, setData] = useState<TraceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/items/${itemId}/trace`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trace = data?.trace ?? null;
  const llmCalls = trace?.steps.filter((s) => s.stage === "llm" && s.ms != null).length ?? 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(33,30,24,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 16,
          boxShadow: "0 30px 80px -30px rgba(33,30,24,.55)",
          width: "min(860px, 100%)", maxHeight: "min(82vh, 900px)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "dm-drop-in .3s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #EFE9DC" }}>
          <span style={{ color: C.accent, fontSize: 14 }}>⌁</span>
          <span className="dm-mono" style={{ fontSize: 10.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#6B6557" }}>
            pipeline trace
          </span>
          {trace && (
            <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>
              {trace.steps.length} steps · {llmCalls} LLM call{llmCalls === 1 ? "" : "s"} · {fmtMs(trace.totalMs)}
              {trace.truncated ? " · detail truncated (size budget)" : ""}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#8A8477", fontSize: 15, fontFamily: "inherit", padding: 4 }}
          >
            ✕
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "4px 14px 14px" }}>
          {failed && (
            <div style={{ padding: 24, fontSize: 13, color: "#6B6557" }}>Couldn&apos;t load the trace.</div>
          )}
          {!failed && !data && (
            <div className="dm-mono" style={{ padding: 24, fontSize: 11, color: "#A39B8B" }}>loading…</div>
          )}
          {data && !trace && (
            <div style={{ padding: 24, fontSize: 13, color: "#6B6557", lineHeight: 1.6 }}>
              No trace recorded for this message.{" "}
              {data.enabled
                ? "It was processed before dev mode was on — send a new message to see its full pipeline story."
                : "Dev mode is off — set DEV_TRACE=1 (it's on by default outside production) and send a new message."}
            </div>
          )}
          {trace && trace.steps.map((s, i) => <StepRow key={i} s={s} />)}
        </div>
      </div>
    </div>
  );
}
