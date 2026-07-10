"use client";

/**
 * TIMELINE view — the knowledge vault projected chronologically. Every event is
 * derived from data that already carries time: messages that arrived, domain
 * dates on facts (due dates, meeting days), corrections (superseded facts), and
 * first sightings. Click an entity chip to narrow to "everything about X, in
 * order"; future domain dates surface as Upcoming. Pure query — nothing stored.
 */

import { useEffect, useMemo, useState } from "react";
import { C, CountUp } from "./ui";
import type { TimelineEvent, TimelineEntityRef } from "@/lib/datamodo/timeline";

const TYPE_META: Record<TimelineEvent["type"], { glyph: string; tone: string; label: string }> = {
  message: { glyph: "✉", tone: C.blue, label: "message" },
  date: { glyph: "◷", tone: C.gold, label: "date" },
  change: { glyph: "⇄", tone: C.accent, label: "change" },
  seen: { glyph: "◍", tone: C.green, label: "first seen" },
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

  // On a filter change the previous events stay visible until the new fetch
  // lands (no flash); `loading` only gates the very first paint.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/knowledge/timeline${filter ? `?entity=${encodeURIComponent(filter.id)}` : ""}`);
        const json = await res.json();
        if (alive) setEvents(json.events ?? []);
      } catch {
        if (alive) setEvents([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [filter]);

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

  const section = (title: string, list: TimelineEvent[], key: string, accent = false) => (
    <div key={key} style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: "0 2px 6px" }}>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: "-0.01em", color: accent ? C.accent : C.ink, margin: 0 }}>{title}</h2>
        <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F" }}>{list.length}</span>
      </div>
      <div style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 13, padding: "6px 10px", display: "grid" }}>
        {list.map((ev, i) => (
          <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid #F4EFE4" }}>
            <EventRow ev={ev} onFilter={setFilter} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}>
            {filter ? <>Everything about {filter.label}, in order</> : <><CountUp value={events.length} /> moment{events.length === 1 ? "" : "s"}, in order</>}
          </div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Messages, due dates, corrections & first sightings — derived live from your knowledge</div>
        </div>
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

      {upcoming.length > 0 && section("Upcoming", upcoming, "upcoming", true)}
      {days.map(([dayKey, list]) => section(dayLabel(dayKey, todayYear), list, dayKey))}
    </div>
  );
}
