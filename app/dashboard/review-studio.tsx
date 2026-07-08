"use client";

/**
 * REVIEW STUDIO — where the user validates what the knowledge layer inferred.
 *
 * Layout follows the QUESTION, not a template:
 *   • entity_merge → "are these the same thing?"   (side-by-side comparison)
 *   • fact_conflict → "which value is right now?"   (before → after diff)
 *   • extraction   → "did we understand this?"      (message ↔ facts, editorial)
 * Flow: triage header → impact spotlight → calmer grouped sections, ranked by impact.
 *
 * Data comes from GET /api/knowledge/reviews (typed by lib/datamodo/review-types).
 * When there are no real reviews yet, we show a SIMULATED set (same shape) as a
 * labelled preview so the design is visible.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { C, Hov, monoLabel, ghostBtn, relTime } from "./ui";
import type { ReviewItem, MergeReview, ConflictReview, ExtractionReview, ReviewEntitySide } from "@/lib/datamodo/review-types";

/* --------------------------- simulated fallback --------------------------- */

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const SIMULATED: ReviewItem[] = [
  {
    id: "sim-m1", kind: "entity_merge", impact: 12, confidence: 0.9, createdAt: ago(2),
    parsed: { label: "Acme", type: "company", source: "Email · “Q3 renewal”", attrs: [{ k: "email domain", v: "acme.com" }, { k: "connected", v: "1 fact" }] },
    canonical: { label: "Acme Group", type: "company", attrs: [{ k: "domain", v: "acme.com" }, { k: "connected", v: "12 facts" }] },
    reason: "Same email domain (acme.com); “Acme” is the common short form of the canonical name.",
  },
  {
    id: "sim-m2", kind: "entity_merge", impact: 4, confidence: 0.74, createdAt: ago(5),
    parsed: { label: "J. Porter", type: "person", source: "WhatsApp", attrs: [{ k: "at", v: "Brightwave" }, { k: "connected", v: "1 fact" }] },
    canonical: { label: "James Porter", type: "person", attrs: [{ k: "email", v: "james.porter@brightwave.io" }, { k: "connected", v: "4 facts" }] },
    reason: "Initial + surname match, both tied to Brightwave.",
  },
  {
    id: "sim-c1", kind: "fact_conflict", impact: 3, confidence: 0.88, createdAt: ago(3),
    subject: "Invoice INV-4417", field: "amount", was: "$18,500.00", now: "$17,650.00",
    wasSource: "1 source", nowSource: "2 sources", note: "A later email restated the total after the multi-year discount.",
  },
  {
    id: "sim-c2", kind: "fact_conflict", impact: 2, confidence: 0.95, createdAt: ago(6),
    subject: "Brightwave", field: "account manager", was: "James Porter", now: "Elena Ruiz",
    wasSource: "1 source", nowSource: "1 source", note: "“Our new account manager, Elena Ruiz, will be your main point of contact.”",
  },
  {
    id: "sim-e1", kind: "extraction", impact: 2, confidence: 0.58, createdAt: ago(20), from: "+1 (415) 555-0142", channel: "whatsapp",
    snippet: "Dinner with the Northwind team Thurs 7pm — they’ll send the SOW next week 👍",
    entities: [{ label: "Northwind", type: "company" }],
    facts: [{ s: "Northwind", p: "meeting", v: "Thu 7:00pm", c: 0.62 }, { s: "Northwind", p: "expected", v: "SOW next week", c: 0.55 }],
  },
];

export const SIMULATED_REVIEW_COUNT = SIMULATED.length;

/* ------------------------------ small atoms ------------------------------- */

function confColor(c: number): string {
  return c >= 0.85 ? C.green : c >= 0.65 ? C.gold : C.accent;
}

function ConfidenceRing({ value, size = 46 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const col = confColor(value);
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECE5D8" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={4} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - value)} />
      </svg>
      <span className="dm-mono" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: col }}>{Math.round(value * 100)}</span>
    </span>
  );
}

function ImpactMeter({ n }: { n: number }) {
  const filled = Math.max(1, Math.round((Math.min(n, 12) / 12) * 5));
  return (
    <span title={`Touches ${n} facts / edges`} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", height: 14 }}>
        {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 3, height: 5 + i * 2, borderRadius: 1, background: i < filled ? C.ink : "#E1D9C8" }} />)}
      </span>
      <span className="dm-mono" style={{ fontSize: 10.5, color: "#8A8477" }}>touches {n}</span>
    </span>
  );
}

const CHANNEL: Record<string, { emoji: string; label: string }> = {
  email: { emoji: "✉", label: "Email" }, whatsapp: { emoji: "🟢", label: "WhatsApp" },
  slack: { emoji: "▦", label: "Slack" }, teams: { emoji: "◇", label: "Teams" },
};
const channelOf = (c: string) => CHANNEL[c] ?? { emoji: "•", label: c };

function TypeChip({ label, tone }: { label: string; tone: string }) {
  return <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: tone, background: "#fff", border: `1px solid ${tone}33`, borderRadius: 6, padding: "2px 7px" }}>{label}</span>;
}

function EntityCard({ side, tone, tag }: { side: ReviewEntitySide; tone: string; tag: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: "#fff", border: "1px solid #ECE5D8", borderRadius: 13, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{side.label.charAt(0)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{side.label}</div>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B" }}>{tag} · {side.type}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 12px", fontSize: 12.5 }}>
        {side.attrs.map((a) => (
          <Fragment key={a.k}>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", whiteSpace: "nowrap" }}>{a.k}</span>
            <span style={{ color: "#3A352C", overflow: "hidden", textOverflow: "ellipsis" }}>{a.v}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

type Resolve = (id: string, action: "accept" | "reject") => void;

function Actions({ id, onResolve, acceptLabel, rejectLabel }: { id: string; onResolve: Resolve; acceptLabel: string; rejectLabel: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Hov onClick={() => onResolve(id, "accept")} base={{ background: C.green, color: "#fff", border: "none", borderRadius: 9, padding: "8px 15px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }} hover={{ background: "#357C4C" }}>{acceptLabel}</Hov>
      <Hov onClick={() => onResolve(id, "reject")} base={{ ...ghostBtn, padding: "7px 13px", fontSize: 12.5 }} hover={{ background: "#FBF8F1" }}>{rejectLabel}</Hov>
    </div>
  );
}

/* --------------------------- kind-specific cards -------------------------- */

function MergeCard({ m, onResolve }: { m: MergeReview; onResolve: Resolve }) {
  const tone = confColor(m.confidence ?? 0);
  return (
    <div style={{ border: "1px solid #E7E0D2", borderRadius: 16, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "#FBF8F1", borderBottom: "1px solid #EFE9DC", flexWrap: "wrap" }}>
        <TypeChip label="Possible duplicate" tone={C.accent} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Same {m.parsed.type}?</span>
        <div style={{ marginLeft: "auto" }}><ImpactMeter n={m.impact} /></div>
      </div>
      <div style={{ padding: 16, display: "flex", alignItems: "stretch", gap: 12, flexWrap: "wrap" }}>
        <EntityCard side={m.parsed} tone={C.blue} tag="just parsed" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 64 }}>
          <ConfidenceRing value={m.confidence ?? 0} />
          <span className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B" }}>match</span>
          <span style={{ color: tone, fontSize: 18, lineHeight: 1 }}>⇄</span>
        </div>
        <EntityCard side={m.canonical} tone={C.ink} tag="in your data" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px 16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: "#6B665B", lineHeight: 1.5, display: "flex", gap: 8 }}>
          <span style={{ color: tone, flexShrink: 0 }}>❝</span><span>{m.reason}</span>
        </div>
        <Actions id={m.id} onResolve={onResolve} acceptLabel={`Merge into ${m.canonical.label}`} rejectLabel="Keep separate" />
      </div>
    </div>
  );
}

function ConflictCard({ c, onResolve }: { c: ConflictReview; onResolve: Resolve }) {
  return (
    <div style={{ border: "1px solid #F0DFd6", borderRadius: 13, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 15px", background: "#FDF6F2", borderBottom: "1px solid #F3E7DF", flexWrap: "wrap" }}>
        <TypeChip label="Value changed" tone={C.gold} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{c.subject}</span>
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477" }}>· {c.field}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {c.confidence != null && <span className="dm-mono" style={{ fontSize: 10.5, color: confColor(c.confidence) }}>{Math.round(c.confidence * 100)}% sure</span>}
          <ImpactMeter n={c.impact} />
        </div>
      </div>
      <div style={{ padding: "13px 15px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
            <div style={{ flex: 1 }}>
              <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B", marginBottom: 3 }}>Current · {c.wasSource}</div>
              <div style={{ fontSize: 14, color: "#B44536", textDecoration: "line-through" }}>{c.was}</div>
            </div>
            <span style={{ color: "#C9BCA6", fontSize: 16 }}>→</span>
            <div style={{ flex: 1 }}>
              <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: C.green, marginBottom: 3 }}>New · {c.nowSource}</div>
              <div style={{ fontSize: 14, color: C.ink, fontWeight: 700 }}>{c.now}</div>
            </div>
          </div>
          <Actions id={c.id} onResolve={onResolve} acceptLabel="Use new" rejectLabel="Keep current" />
        </div>
        <div style={{ fontSize: 12, color: "#8A8477", marginTop: 10, fontStyle: "italic", borderTop: "1px dashed #EFE9DC", paddingTop: 9 }}>{c.note}</div>
      </div>
    </div>
  );
}

function ExtractionCard({ e, onResolve }: { e: ExtractionReview; onResolve: Resolve }) {
  const ch = channelOf(e.channel);
  const low = (e.confidence ?? 1) < 0.65;
  return (
    <div style={{ border: "1px solid #E7E0D2", borderRadius: 15, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 15px", background: "#FBF8F1", borderBottom: "1px solid #EFE9DC", flexWrap: "wrap" }}>
        <TypeChip label="New from a message" tone={C.blue} />
        {low && <TypeChip label="low confidence" tone={C.gold} />}
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginLeft: "auto" }}>{ch.emoji} {ch.label} · {relTime(e.createdAt)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(240px, 1.1fr)" }}>
        <div style={{ padding: "15px 16px", borderRight: "1px solid #F1EDE4", background: "#FCFAF4" }}>
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginBottom: 8 }}>from {e.from}</div>
          <div style={{ fontSize: 13, color: "#3A352C", lineHeight: 1.6, background: "#fff", border: "1px solid #EDE7DA", borderRadius: "4px 14px 14px 14px", padding: "11px 13px" }}>{e.snippet}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11 }}>
            {e.entities.map((en) => (
              <span key={en.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#57534A", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 999, padding: "3px 9px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: en.type === "person" ? C.blue : en.type === "invoice" ? C.gold : C.accent }} />{en.label}
              </span>
            ))}
          </div>
        </div>
        <div style={{ padding: "15px 16px" }}>
          <div className="dm-mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B", marginBottom: 9 }}>Understood {e.facts.length} fact{e.facts.length === 1 ? "" : "s"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {e.facts.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: confColor(f.c), flexShrink: 0 }} />
                <span style={{ color: "#8A8477" }}>{f.s}</span>
                <span className="dm-mono" style={{ fontSize: 10.5, color: "#B7AF9F" }}>{f.p}</span>
                <span style={{ color: f.ref ? C.accent : C.ink, fontWeight: 600 }}>{f.ref ? `→ ${f.v}` : f.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderTop: "1px solid #F1EDE4", background: "#FCFAF4" }}>
        <ConfidenceRing value={e.confidence ?? 1} size={34} />
        <span style={{ fontSize: 12, color: "#8A8477" }}>{low ? "Worth a glance — some of this is a guess." : "Looks clean — accept to file it into your data."}</span>
        <div style={{ marginLeft: "auto" }}><Actions id={e.id} onResolve={onResolve} acceptLabel="Accept all" rejectLabel="Discard" /></div>
      </div>
    </div>
  );
}

function renderCard(it: ReviewItem, onResolve: Resolve) {
  if (it.kind === "entity_merge") return <MergeCard m={it} onResolve={onResolve} />;
  if (it.kind === "fact_conflict") return <ConflictCard c={it} onResolve={onResolve} />;
  return <ExtractionCard e={it} onResolve={onResolve} />;
}

function SectionHead({ title, hint, count }: { title: string; hint: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "26px 2px 12px" }}>
      <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em", color: C.ink, margin: 0 }}>{title}</h2>
      <span className="dm-mono" style={{ fontSize: 11, color: "#fff", background: "#C9BCA6", borderRadius: 999, padding: "1px 8px" }}>{count}</span>
      <span style={{ fontSize: 12.5, color: "#A39B8B" }}>{hint}</span>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

export function ReviewStudio() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false); // showing simulated fallback

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/knowledge/reviews");
        const json = await res.json();
        const real: ReviewItem[] = json.reviews ?? [];
        if (!alive) return;
        if (real.length > 0) { setItems(real); setPreview(false); }
        else { setItems(SIMULATED); setPreview(true); }
      } catch {
        if (alive) { setItems(SIMULATED); setPreview(true); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const resolve: Resolve = (id, action) => {
    setItems((s) => s.filter((i) => i.id !== id));
    if (!preview) {
      void fetch(`/api/knowledge/reviews/${id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
    }
  };

  const live = useMemo(() => [...items].sort((a, b) => b.impact - a.impact), [items]);
  const spotlight = live[0];
  const rest = live.slice(1);
  const merges = rest.filter((i): i is MergeReview => i.kind === "entity_merge");
  const conflicts = rest.filter((i): i is ConflictReview => i.kind === "fact_conflict");
  const extractions = rest.filter((i): i is ExtractionReview => i.kind === "extraction");
  const counts = {
    merge: live.filter((i) => i.kind === "entity_merge").length,
    conflict: live.filter((i) => i.kind === "fact_conflict").length,
    extraction: live.filter((i) => i.kind === "extraction").length,
  };

  if (loading) return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Loading review queue…</div>;

  if (live.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "80px 20px" }}>
        <div style={{ width: 66, height: 66, borderRadius: 20, background: "#EAF4EC", border: "1px solid #CBE4D2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 28 }}>✓</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.03em", margin: "0 0 8px" }}>All caught up</h2>
        <p style={{ fontSize: 15, color: "#57534A", maxWidth: "44ch", margin: 0, lineHeight: 1.55 }}>Every merge, conflict, and new fact we inferred has been reviewed. Tables update automatically from the facts you accept.</p>
      </div>
    );
  }

  const pill = (n: number, label: string, tone: string) =>
    n > 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#57534A" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: tone }} />{n} {label}{n === 1 ? "" : "s"}</span> : null;

  return (
    <div style={{ maxWidth: 960 }}>
      {preview && (
        <div className="dm-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#6B551F", background: "#FBEFD6", border: "1px solid #E6CF92", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
          <span>◑</span> Preview — no real reviews yet, so this is simulated data showing how the queue looks.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 14, padding: "14px 18px" }}>
        <div style={{ minWidth: 0 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}>{live.length} thing{live.length === 1 ? "" : "s"} to look at</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>You review the facts — your tables fill in from what you accept. Ranked by impact.</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {pill(counts.merge, "duplicate", C.accent)}
          {pill(counts.conflict, "changed value", C.gold)}
          {pill(counts.extraction, "new message", C.blue)}
        </div>
      </div>

      {spotlight && (
        <div style={{ marginTop: 18 }}>
          <div className="dm-mono" style={{ ...monoLabel, display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: C.accent }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: "cc-pulse 2.6s ease-in-out infinite" }} />
            Most impactful · worth your eye first
          </div>
          {renderCard(spotlight, resolve)}
        </div>
      )}

      {merges.length > 0 && (<><SectionHead title="Possible duplicates" hint="Confirm whether we spotted the same thing twice." count={merges.length} /><div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{merges.map((m) => <div key={m.id}>{renderCard(m, resolve)}</div>)}</div></>)}
      {conflicts.length > 0 && (<><SectionHead title="Values that changed" hint="A newer message disagrees with what we had." count={conflicts.length} /><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{conflicts.map((c) => <div key={c.id}>{renderCard(c, resolve)}</div>)}</div></>)}
      {extractions.length > 0 && (<><SectionHead title="New from your messages" hint="What we understood — accept to file it into your knowledge." count={extractions.length} /><div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{extractions.map((e) => <div key={e.id}>{renderCard(e, resolve)}</div>)}</div></>)}
    </div>
  );
}
