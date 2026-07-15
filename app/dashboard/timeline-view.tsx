"use client";

/**
 * TIMELINE view — the knowledge vault projected chronologically. Every event is
 * derived from data that already carries time: messages that arrived, domain
 * dates on facts (due dates, meeting days), corrections (superseded facts), and
 * first sightings. Click an entity chip to narrow to "everything about X, in
 * order"; future domain dates surface as Upcoming. Pure query — nothing stored.
 */

import { useEffect, useMemo, useState } from "react";
import { C, CountUp, relTime } from "./ui";
import type { CommitDiffLine, TimelineCommit, TimelineEvent, TimelineEntityRef } from "@/lib/datamodo/timeline";

const TYPE_META: Record<TimelineEvent["type"], { glyph: string; tone: string; label: string }> = {
  message: { glyph: "✉", tone: C.blue, label: "message" },
  date: { glyph: "◷", tone: C.gold, label: "date" },
  change: { glyph: "⇄", tone: C.accent, label: "change" },
  seen: { glyph: "◍", tone: C.green, label: "first seen" },
};

const CHANNEL_TINT: Record<string, string> = {
  email: "#EA4335", gmail: "#EA4335", outlook: "#0A66C2",
  whatsapp: "#25D366", slack: "#611f69", teams: "#464EB8", telegram: "#2AABEE",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wed, Jul 9" (+ year when it isn't this year). Locale-stable on purpose. */
function dayLabel(dayKey: string, todayYear: number): string {
  const d = new Date(dayKey + "T00:00:00Z");
  const base = `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return d.getUTCFullYear() === todayYear ? base : `${base}, ${d.getUTCFullYear()}`;
}

function timeLabel(ev: TimelineEvent): string {
  if (ev.dateOnly) return "all day";
  const d = new Date(ev.ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function EventRow({ ev, onFilter }: { ev: TimelineEvent; onFilter: (ref: TimelineEntityRef) => void }) {
  const meta = TYPE_META[ev.type];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 26px 1fr", gap: 10, alignItems: "start", padding: "7px 4px" }}>
      <span className="dm-mono" style={{ fontSize: 10, color: "#B7AF9F", paddingTop: 4, textAlign: "right" }}>{timeLabel(ev)}</span>
      <span
        title={meta.label}
        style={{ width: 24, height: 24, borderRadius: 8, background: "#fff", border: `1px solid ${meta.tone}44`, color: meta.tone, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}
      >
        {meta.glyph}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: ev.type === "message" ? 600 : 500, lineHeight: 1.35, overflowWrap: "anywhere" }}>
          {ev.title}
          {ev.channel && <span className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B", marginLeft: 7, textTransform: "uppercase", letterSpacing: "0.05em" }}>{ev.channel}</span>}
        </div>
        {ev.detail && (
          <div className="dm-mono" style={{ fontSize: 11, color: ev.type === "change" ? C.accent : "#8A8477", marginTop: 2, overflowWrap: "anywhere" }}>{ev.detail}</div>
        )}
        {ev.entities.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
            {ev.entities.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onFilter(r)}
                title={`Only events about ${r.label}`}
                style={{ border: "1px solid #E1D9C8", background: "#FBF8F1", borderRadius: 999, padding: "2px 9px", fontSize: 10.5, color: "#514C43", cursor: "pointer", fontFamily: "inherit" }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TimelineView() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TimelineEntityRef | null>(null);
  // Message events can sit at arrival time (default) or at the sender's send
  // time — forwarded email often carries a much older date.
  const [basis, setBasis] = useState<"received" | "sent">("received");
  // Cards rise in with a gentle stagger on first paint; reduced motion (or
  // SSR) starts settled.
  const [mounted, setMounted] = useState(() =>
    typeof window === "undefined" || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true),
  );
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // On a filter change the previous events stay visible until the new fetch
  // lands (no flash); `loading` only gates the very first paint.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("entity", filter.id);
        if (basis === "sent") params.set("basis", "sent");
        const qs = params.toString();
        const res = await fetch(`/api/knowledge/timeline${qs ? `?${qs}` : ""}`);
        const json = await res.json();
        if (alive) setEvents(json.events ?? []);
      } catch {
        if (alive) setEvents([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [filter, basis]);

  // Group into day sections, newest first; future days pool under "Upcoming"
  // (a due date next week belongs above the past, not lost inside it).
  const { upcoming, days, todayYear } = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const up: TimelineEvent[] = [];
    const byDay = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const key = ev.ts.slice(0, 10);
      if (key > todayKey) { up.push(ev); continue; }
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(ev);
    }
    // Upcoming reads soonest-first — the next thing due sits on top.
    up.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    return { upcoming: up, days: [...byDay.entries()], todayYear: now.getFullYear() };
  }, [events]);

  if (loading && events.length === 0) {
    return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Assembling the timeline…</div>;
  }

  if (events.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 26 }}>◷</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 8px" }}>{filter ? `Nothing about ${filter.label} yet` : "No history yet"}</h2>
        <p style={{ fontSize: 14.5, color: "#57534A", maxWidth: "44ch", margin: 0, lineHeight: 1.55 }}>
          {filter ? "Events appear here as messages mention it." : "As messages arrive and facts land, everything lines up here in order — arrivals, due dates, corrections."}
        </p>
        {filter && (
          <button type="button" onClick={() => setFilter(null)} className="dm-mono" style={{ marginTop: 16, fontSize: 11, color: C.ink, background: "#fff", border: "1px solid #DDD5C5", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>
            ← Back to everything
          </button>
        )}
      </div>
    );
  }

  // Design skin ("Datamodo Explorer v2" handoff, TimelineView): one vertical
  // rail, a coral dot per day, white cards that rise in with a gentle stagger.
  let cardIdx = 0;
  const card = (ev: TimelineEvent, i: number) => {
    const meta = TYPE_META[ev.type];
    const tint = ev.channel ? CHANNEL_TINT[ev.channel.toLowerCase()] : null;
    const d = Math.min(cardIdx++, 14) * 55;
    return (
      <div key={i} style={{
        background: "#FFFDF8", border: "1px solid #E7E0D2", borderRadius: 14,
        padding: "12px 15px", boxShadow: "0 18px 44px -34px rgba(33,30,24,.35)",
        opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(14px)",
        transition: `opacity 420ms cubic-bezier(0.16,1,0.3,1) ${d}ms, transform 420ms cubic-bezier(0.16,1,0.3,1) ${d}ms`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span title={meta.label} style={{ color: meta.tone, fontSize: 13, lineHeight: 1 }}>{meta.glyph}</span>
          <span style={{ fontSize: 13.5, color: C.ink, fontWeight: ev.type === "message" ? 600 : 500, lineHeight: 1.35, overflowWrap: "anywhere", minWidth: 0 }}>{ev.title}</span>
          <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 10, color: "#B7AF9F", whiteSpace: "nowrap" }}>{timeLabel(ev)}</span>
        </div>
        {(ev.detail || ev.channel) && (
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "#57534A", flexWrap: "wrap" }}>
            {ev.channel && <span className="dm-mono" style={{ fontSize: 10.5, color: tint ?? "#8A8477", fontWeight: 500 }}>{ev.channel}</span>}
            {ev.channel && ev.detail && <span style={{ color: "#A39B8B" }}>·</span>}
            {ev.detail && <span className={ev.type === "change" ? "dm-mono" : undefined} style={{ fontSize: ev.type === "change" ? 11.5 : 12.5, color: ev.type === "change" ? C.accent : "#57534A", overflowWrap: "anywhere" }}>{ev.detail}</span>}
          </div>
        )}
        {ev.entities.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
            {ev.entities.map((r) => (
              <button key={r.id} type="button" onClick={() => setFilter(r)} title={`Only events about ${r.label}`}
                style={{ border: "1px solid #E1D9C8", background: "#FAF6EE", borderRadius: 999, padding: "2px 9px", fontSize: 11, color: "#514C43", cursor: "pointer", fontFamily: "inherit" }}>
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const section = (title: string, list: TimelineEvent[], key: string, accent = false) => (
    <div key={key} style={{ marginBottom: 8 }}>
      <div style={{ position: "relative", margin: "18px 0 12px" }}>
        <div style={{ position: "absolute", left: -26, top: 1, width: 14, height: 14, borderRadius: "50%", background: accent ? C.gold : C.accent, border: "3px solid #F6F2E9", transform: "translateX(-1px)", boxSizing: "border-box" }} />
        <span className="dm-mono" style={{ fontSize: 12, letterSpacing: "0.04em", color: accent ? "#8A6D1F" : "#8A8477" }}>{title}</span>
        <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", marginLeft: 8 }}>{list.length}</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((ev, i) => card(ev, i))}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.09em", color: "#A39B8B", marginBottom: 5 }}>most recent first</div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.025em", color: C.ink }}>
            {filter ? <>Everything about {filter.label}, in order</> : <>What datamodo learned</>}
          </div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 3 }}><CountUp value={events.length} /> moment{events.length === 1 ? "" : "s"} — messages, due dates, corrections & first sightings, derived live</div>
        </div>
        <button
          type="button"
          onClick={() => setBasis((b) => (b === "received" ? "sent" : "received"))}
          title="Where messages sit on the axis: when they arrived here, or when the sender sent them (forwarded email keeps its original date)"
          className="dm-mono"
          style={{ marginLeft: filter ? 0 : "auto", fontSize: 10.5, color: "#57534A", background: "#fff", border: "1px solid #DDD5C5", borderRadius: 999, padding: "4px 11px", cursor: "pointer", fontFamily: "inherit" }}
        >
          clock: {basis === "received" ? "arrived" : "sent"} ⇄
        </button>
        {filter && (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="dm-mono"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, color: C.ink, background: "#FDF6F2", border: "1px solid #F3D6CB", borderRadius: 999, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}
          >
            <span style={{ color: C.accent }}>◍ {filter.label}</span> ×
          </button>
        )}
      </div>

      <div style={{ position: "relative", paddingLeft: 26 }}>
        {/* the rail */}
        <div style={{ position: "absolute", left: 6, top: 6, bottom: 6, width: 2, background: "#E7E0D2" }} />
        {upcoming.length > 0 && section("Upcoming", upcoming, "upcoming", true)}
        {days.map(([dayKey, list]) => section(dayLabel(dayKey, todayYear), list, dayKey))}
        <div style={{ position: "relative", marginTop: 20 }}>
          <div style={{ position: "absolute", left: -24, top: 3, width: 10, height: 10, borderRadius: "50%", border: "2px solid #DDD5C5", background: "#F6F2E9", boxSizing: "border-box" }} />
          <span className="dm-mono" style={{ fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#A39B8B" }}>derived live from your knowledge — nothing stored</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The per-entity timeline, embedded on an entity page as a collapsed
 * disclosure ("◷ History") — progressive disclosure, fetched only when opened.
 * Same projection as the Timeline view, narrowed to one entity.
 */
export function EntityHistory({ entityId, onOpen }: {
  entityId: string;
  /** Navigate to another entity's page (event chips). */
  onOpen?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // "story" = the timeline events; "blame" = which commit added/changed each
  // of THIS entity's facts (buildCommitLog narrows commit lines to the entity).
  const [mode, setMode] = useState<"story" | "blame">("story");
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [commits, setCommits] = useState<TimelineCommit[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        if (mode === "story" && events === null) {
          const res = await fetch(`/api/knowledge/timeline?entity=${encodeURIComponent(entityId)}`);
          const json = await res.json();
          if (alive) setEvents(json.events ?? []);
        } else if (mode === "blame" && commits === null) {
          const res = await fetch(`/api/knowledge/timeline?view=commits&entity=${encodeURIComponent(entityId)}`);
          const json = await res.json();
          if (alive) setCommits(json.commits ?? []);
        }
      } catch {
        if (alive) { if (mode === "story") setEvents([]); else setCommits([]); }
      }
    })();
    return () => { alive = false; };
  }, [open, mode, events, commits, entityId]);

  const todayYear = new Date().getFullYear();
  const shown = (events ?? []).slice(0, 30);
  const tab = (v: "story" | "blame"): React.CSSProperties => ({
    fontSize: 10, fontFamily: "inherit", cursor: "pointer", border: "none", borderRadius: 6, padding: "3px 9px",
    background: mode === v ? "#EFE9DC" : "transparent", color: mode === v ? C.ink : "#A39B8B", letterSpacing: "0.04em",
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="dm-mono"
        style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", padding: "10px 12px" }}
      >
        ◷ History — {mode === "blame" ? "which run changed what" : "everything about this, in order"}
        <span style={{ marginLeft: "auto", display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>›</span>
      </button>
      {open && (
        <div style={{ padding: "0 10px 8px" }}>
          <div className="dm-mono" style={{ display: "flex", gap: 4, padding: "0 2px 6px" }}>
            <button type="button" style={tab("story")} onClick={() => setMode("story")}>◷ story</button>
            <button type="button" style={tab("blame")} onClick={() => setMode("blame")}>⎇ blame</button>
          </div>

          {mode === "story" ? (
            <>
              {events === null && <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", padding: "4px 4px 8px" }}>Assembling…</div>}
              {events !== null && shown.length === 0 && (
                <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", padding: "4px 4px 8px" }}>No dated events yet.</div>
              )}
              {shown.map((ev, i) => (
                <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid #F4EFE4" }}>
                  <div className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", padding: "6px 4px 0" }}>{dayLabel(ev.ts.slice(0, 10), todayYear)}</div>
                  <EventRow ev={ev} onFilter={onOpen ? (r) => onOpen(r.id) : () => {}} />
                </div>
              ))}
              {events !== null && events.length > shown.length && (
                <div className="dm-mono" style={{ fontSize: 10, color: "#B7AF9F", padding: "6px 4px" }}>{events.length - shown.length} older moments in the Timeline view</div>
              )}
            </>
          ) : (
            <>
              {commits === null && <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", padding: "4px 4px 8px" }}>Assembling…</div>}
              {commits !== null && commits.length === 0 && (
                <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", padding: "4px 4px 8px" }}>No recorded changes to this yet.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4 }}>
                {(commits ?? []).slice(0, 20).map((c) => <CommitCard key={c.itemId} c={c} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   COMMIT LOG — the Review tab's git-style history (roadmap "Review = ALL
   change", 2026-07-14). Each extraction run is a COMMIT: the message is the
   commit message, the facts it wrote are the diff (`+ added`, `~ was → now`).
   Pure query over the bitemporal vault (buildCommitLog) — nothing stored.
   ========================================================================== */

function DiffLine({ l }: { l: CommitDiffLine }) {
  const change = l.op === "change";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 12px", fontSize: 12, minWidth: 0 }}>
      <span className="dm-mono" style={{ fontSize: 11, fontWeight: 700, color: change ? C.gold : C.green, flexShrink: 0, width: 10 }}>{change ? "~" : "+"}</span>
      <span style={{ color: "#57534A", flexShrink: 0 }}>{l.subject?.label ?? "?"}</span>
      <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", flexShrink: 0 }}>{l.predicate.replace(/_/g, " ")}</span>
      {change && l.was !== undefined && (
        <>
          <span style={{ color: "#B44536", textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.was}</span>
          <span style={{ color: "#C9BCA6", flexShrink: 0 }}>→</span>
        </>
      )}
      <span style={{ color: l.ref ? C.accent : C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.ref ? `→ ${l.value}` : l.value}</span>
    </div>
  );
}

function CommitCard({ c }: { c: TimelineCommit }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 6;
  const lines = expanded ? c.lines : c.lines.slice(0, PREVIEW);
  const tint = CHANNEL_TINT[c.channel] ?? "#8A8477";
  return (
    <div style={{ border: "1px solid #E7E0D2", borderRadius: 13, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", background: "#FBF8F1", borderBottom: "1px solid #EFE9DC", flexWrap: "wrap" }}>
        <span className="dm-mono" title={c.itemId} style={{ fontSize: 10.5, color: "#A39B8B", background: "#fff", border: "1px solid #ECE5D8", borderRadius: 6, padding: "1px 7px" }}>{c.itemId.slice(0, 7)}</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tint, flexShrink: 0 }} />
        <span className="dm-mono" style={{ fontSize: 10, color: "#8A8477", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.channel}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, flex: 1, minWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
        <span className="dm-mono" style={{ fontSize: 10.5, flexShrink: 0 }}>
          {c.added > 0 && <span style={{ color: C.green }}>+{c.added}</span>}
          {c.added > 0 && c.changed > 0 && <span style={{ color: "#C9BCA6" }}> </span>}
          {c.changed > 0 && <span style={{ color: C.gold }}>~{c.changed}</span>}
        </span>
        <span className="dm-mono" style={{ fontSize: 10, color: "#B7AF9F", flexShrink: 0 }}>{relTime(c.ts)}</span>
      </div>
      <div style={{ padding: "6px 0" }}>
        {c.sender && <div className="dm-mono" style={{ fontSize: 10, color: "#B7AF9F", padding: "2px 12px 4px" }}>from {c.sender}</div>}
        {lines.map((l, i) => <DiffLine key={i} l={l} />)}
        {c.lines.length > PREVIEW && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="dm-mono"
            style={{ fontSize: 10.5, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: "5px 12px", fontFamily: "inherit" }}>
            {expanded ? "collapse" : `show ${c.lines.length - PREVIEW} more`}
          </button>
        )}
      </div>
    </div>
  );
}

export function CommitLogView() {
  const [commits, setCommits] = useState<TimelineCommit[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/knowledge/timeline?view=commits");
        const json = await res.json();
        if (alive) setCommits(json.commits ?? []);
      } catch {
        if (alive) setCommits([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (commits === null) {
    return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Assembling your history…</div>;
  }
  if (commits.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 24 }}>⎇</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 8px" }}>No commits yet</h2>
        <p style={{ fontSize: 14.5, color: "#57534A", maxWidth: "46ch", margin: 0, lineHeight: 1.55 }}>Every message that adds or changes facts lands here as a commit — your data&apos;s git log, derived from the vault, nothing stored twice.</p>
      </div>
    );
  }
  const totalAdd = commits.reduce((n, c) => n + c.added, 0);
  const totalChg = commits.reduce((n, c) => n + c.changed, 0);
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477", margin: "0 2px 12px" }}>
        {commits.length} commit{commits.length === 1 ? "" : "s"} · <span style={{ color: C.green }}>+{totalAdd}</span> <span style={{ color: C.gold }}>~{totalChg}</span> — every run that changed your graph, newest first
      </div>
      <div className="dm-stagger" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {commits.map((c) => <CommitCard key={c.itemId} c={c} />)}
      </div>
    </div>
  );
}
