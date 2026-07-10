import React from "react";

/**
 * datamodo ChangeReview — the review / versioning queue. datamodo proposes
 * changes to your database (new records, field updates, merges, graph links,
 * removals) extracted from your messages; you ACCEPT or REJECT each one.
 *
 * Every change carries provenance (who + which channel + when) and a
 * confidence score. Diffs render inline: additions in green, old→new field
 * edits with the old value struck through, removals struck.
 *
 * Interactions:
 *  - Hover a card → it lifts (shadow + rise), matching the SpotlightCard feel.
 *  - Accept → coral flash, then the card COLLAPSES into a green "committed"
 *    strip with an Undo link. Reject → collapses into a muted "dismissed" strip.
 *  - Header shows live progress; "Accept all" resolves the queue, staggered.
 *
 * changes: [{ id, op, entity, table, source:{name,channel,time}, confidence,
 *             fields?:[{label, from, to}], summary? }]
 *   op: "new" | "update" | "merge" | "link" | "remove"
 */

const OP_META = {
  new:    { label: "New record",      rail: "var(--dm-success,#3F8F5B)", tint: "var(--dm-success-bg,#E4F0E8)", on: "var(--dm-success,#3F8F5B)" },
  update: { label: "Update",          rail: "var(--dm-accent,#E4593B)",  tint: "var(--dm-accent-tint-2,#FDF1EC)", on: "var(--dm-accent,#E4593B)" },
  merge:  { label: "Merge duplicate", rail: "var(--dm-warning,#B08A2E)", tint: "var(--dm-warning-bg,#F6ECD4)", on: "var(--dm-warning,#B08A2E)" },
  link:   { label: "New link",        rail: "var(--dm-accent,#E4593B)",  tint: "var(--dm-accent-tint,#FBEAE3)", on: "var(--dm-accent,#E4593B)" },
  remove: { label: "Remove",          rail: "var(--dm-mac-red,#FF5F57)", tint: "#FBE9E7", on: "#C7362C" },
};

const DEFAULT_CHANGES = [
  { id: "c1", op: "update", entity: "Acme Inc", table: "Companies", confidence: 0.97,
    source: { name: "Sarah Chen", channel: "Gmail", time: "2h ago" },
    fields: [{ label: "Domain", from: "acme.io", to: "acme.co" }, { label: "Phone", from: null, to: "+1 415 555 0132" }] },
  { id: "c2", op: "new", entity: "Invoice #A-204", table: "Invoices", confidence: 0.93,
    source: { name: "Dana Okafor", channel: "Gmail", time: "4h ago" },
    fields: [{ label: "Amount", from: null, to: "$12,000.00" }, { label: "Due", from: null, to: "Mar 31, 2026" }, { label: "Vendor", from: null, to: "Acme Inc" }] },
  { id: "c3", op: "link", entity: "Invoice #A-204", table: "Knowledge graph", confidence: 0.88,
    source: { name: "Priya S.", channel: "WhatsApp", time: "1d ago" },
    summary: "Link **#A-204** — *belongs to* → **Acme Inc**" },
  { id: "c4", op: "merge", entity: "Acme Inc", table: "Companies", confidence: 0.82,
    source: { name: "Slack #deals", channel: "Slack", time: "1d ago" },
    summary: "Merge **ACME Incorporated** into **Acme Inc** — same domain, 2 shared contacts" },
  { id: "c5", op: "remove", entity: "dana okafor (2)", table: "People", confidence: 0.74,
    source: { name: "Teams", channel: "Teams", time: "2d ago" },
    summary: "Remove **duplicate contact** — merged into *Dana Okafor*" },
];

export function ChangeReview({ changes = DEFAULT_CHANGES, title = "Suggested changes", onResolve, style = {} }) {
  const [status, setStatus] = React.useState({});
  const [flash, setFlash] = React.useState(null);

  const resolve = (id, action) => {
    if (action === "accepted") { setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 240); }
    setStatus((s) => ({ ...s, [id]: action }));
    onResolve && onResolve(id, action);
  };
  const undo = (id) => setStatus((s) => { const n = { ...s }; delete n[id]; return n; });

  const pending = changes.filter((c) => !status[c.id]);
  const reviewed = changes.length - pending.length;
  const pct = changes.length ? Math.round((reviewed / changes.length) * 100) : 0;
  const acceptAll = () => pending.forEach((c, i) => setTimeout(() => resolve(c.id, "accepted"), i * 110));

  return (
    <div style={{ fontFamily: "var(--dm-font-body, sans-serif)", color: "var(--dm-ink,#211E18)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontFamily: "var(--dm-font-display, sans-serif)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>{title}</span>
            <span style={{ fontFamily: "var(--dm-font-mono, monospace)", fontSize: 10.5, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: pending.length ? "var(--dm-accent,#E4593B)" : "var(--dm-success,#3F8F5B)", color: "var(--dm-accent-on,#FFF8F4)" }}>{pending.length}</span>
          </div>
          <div style={{ fontFamily: "var(--dm-font-mono, monospace)", fontSize: 10.5, letterSpacing: ".02em", color: "var(--dm-text-faint,#A39B8B)", marginTop: 5 }}>{reviewed} of {changes.length} reviewed</div>
        </div>
        <button
          onClick={acceptAll} disabled={!pending.length}
          style={{ flexShrink: 0, border: "1px solid " + (pending.length ? "var(--dm-accent,#E4593B)" : "var(--dm-border-2,#E1D9C8)"), background: pending.length ? "var(--dm-accent,#E4593B)" : "var(--dm-border-2,#E1D9C8)", color: "var(--dm-accent-on,#FFF8F4)", fontFamily: "var(--dm-font-body,sans-serif)", fontWeight: 600, fontSize: 13, padding: "8px 14px", borderRadius: 9, cursor: pending.length ? "pointer" : "not-allowed", transition: "background var(--dm-dur,220ms) ease, transform var(--dm-dur-fast,140ms) ease" }}
          onMouseDown={(e) => pending.length && (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >Accept all</button>
      </div>

      <div style={{ height: 4, borderRadius: 3, background: "var(--dm-border-soft,#EFE9DC)", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: pct + "%", borderRadius: 3, background: reviewed === changes.length ? "var(--dm-success,#3F8F5B)" : "var(--dm-accent,#E4593B)", transition: "width var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1))" }} />
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {changes.map((c) => (
          <ChangeItem key={c.id} change={c} state={status[c.id]} flashing={flash === c.id} onResolve={resolve} onUndo={undo} />
        ))}
        {reviewed === changes.length && (
          <div style={{ textAlign: "center", padding: "10px 0 2px", fontFamily: "var(--dm-font-mono,monospace)", fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--dm-success,#3F8F5B)" }}>✓ Inbox clean — all changes reviewed</div>
        )}
      </div>
    </div>
  );
}

function ChangeItem({ change, state, flashing, onResolve, onUndo }) {
  const [hover, setHover] = React.useState(false);
  const m = OP_META[change.op] || OP_META.update;
  const resolved = !!state;

  return (
    <div style={{ maxHeight: resolved ? 52 : 620, overflow: "hidden", transition: "max-height var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1))" }}>
      {resolved ? (
        <ResolvedStrip state={state} change={change} onUndo={onUndo} />
      ) : (
        <div
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{ position: "relative", border: "1px solid var(--dm-border,#E7E0D2)", borderRadius: 14, background: flashing ? m.tint : "var(--dm-surface,#FFFDF8)", overflow: "hidden", boxShadow: hover ? "0 14px 30px rgba(33,30,24,.13)" : "0 1px 2px rgba(33,30,24,.04)", transform: hover ? "translateY(-3px)" : "translateY(0)", transition: "box-shadow var(--dm-dur,220ms) ease, transform var(--dm-dur,220ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1)), background var(--dm-dur-fast,140ms) ease" }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: m.rail }} />
          <div style={{ padding: "13px 15px 14px 17px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontFamily: "var(--dm-font-mono,monospace)", fontSize: 9.5, fontWeight: 500, letterSpacing: ".07em", textTransform: "uppercase", color: m.on, background: m.tint, padding: "3px 8px", borderRadius: 6 }}>{m.label}</span>
                <span style={{ fontFamily: "var(--dm-font-mono,monospace)", fontSize: 11, color: "var(--dm-text-faint,#A39B8B)" }}>{change.table}</span>
              </div>
              <Source source={change.source} />
            </div>
            <div style={{ fontFamily: "var(--dm-font-display,sans-serif)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 10 }}>{change.entity}</div>
            {change.fields ? (
              <div style={{ display: "grid", gap: 6, marginBottom: 13 }}>
                {change.fields.map((f, i) => <FieldDiff key={i} f={f} op={change.op} />)}
              </div>
            ) : (
              <p style={{ margin: "0 0 13px", fontSize: 13.5, lineHeight: 1.5, color: "var(--dm-text-body,#514C43)" }} dangerouslySetInnerHTML={{ __html: mdlite(change.summary) }} />
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <ConfidenceTag value={change.confidence} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => onResolve(change.id, "rejected")} style={ghostBtn}>Reject</button>
                <button onClick={() => onResolve(change.id, "accepted")} style={{ ...primaryBtn }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--dm-accent-press,#CF4A2F)")} onMouseLeave={(e) => (e.currentTarget.style.background = "var(--dm-accent,#E4593B)")}>Accept</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolvedStrip({ state, change, onUndo }) {
  const accepted = state === "accepted";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 15px", borderRadius: 12, border: "1px solid " + (accepted ? "var(--dm-success,#3F8F5B)" : "var(--dm-border,#E7E0D2)"), background: accepted ? "var(--dm-success-bg,#E4F0E8)" : "var(--dm-surface-sunk,#FAF6EE)", animation: "dm-drop-in var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: accepted ? "var(--dm-success,#3F8F5B)" : "var(--dm-text-faint,#A39B8B)", color: "#fff", fontSize: 11 }}>{accepted ? "✓" : "×"}</span>
        <span style={{ fontSize: 13, color: accepted ? "var(--dm-success,#3F8F5B)" : "var(--dm-text-muted,#8A8477)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {accepted ? "Committed to " + change.table : "Dismissed"} · <b style={{ fontWeight: 600, color: "var(--dm-ink,#211E18)" }}>{change.entity}</b>
        </span>
      </div>
      <button onClick={() => onUndo(change.id)} style={{ border: "none", background: "transparent", color: "var(--dm-accent,#E4593B)", fontFamily: "var(--dm-font-body,sans-serif)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Undo</button>
    </div>
  );
}

function FieldDiff({ f, op }) {
  const isAdd = f.from == null;
  const isRemove = op === "remove";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
      <span style={{ fontFamily: "var(--dm-font-mono,monospace)", fontSize: 10.5, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--dm-text-faint,#A39B8B)", minWidth: 62, flexShrink: 0 }}>{f.label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", fontFamily: "var(--dm-font-mono,monospace)", fontSize: 12.5 }}>
        {isAdd ? (
          <span style={{ color: "var(--dm-success,#3F8F5B)", background: "var(--dm-success-bg,#E4F0E8)", padding: "1px 7px", borderRadius: 5, fontWeight: 500 }}>+ {f.to}</span>
        ) : (
          <>
            <span style={{ color: "var(--dm-text-faint,#A39B8B)", textDecoration: "line-through", textDecorationColor: "var(--dm-mac-red,#FF5F57)" }}>{f.from}</span>
            {!isRemove && <span style={{ color: "var(--dm-text-faint,#A39B8B)" }}>→</span>}
            {!isRemove && <span style={{ color: "var(--dm-ink,#211E18)", fontWeight: 600, background: "var(--dm-accent-tint-2,#FDF1EC)", padding: "1px 7px", borderRadius: 5 }}>{f.to}</span>}
          </>
        )}
      </span>
    </div>
  );
}

function Source({ source }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, fontSize: 11.5, color: "var(--dm-text-muted,#8A8477)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-accent,#E4593B)", flexShrink: 0 }} />
      <span style={{ whiteSpace: "nowrap" }}>{source.name}</span>
      <span style={{ fontFamily: "var(--dm-font-mono,monospace)", fontSize: 10, color: "var(--dm-text-faint,#A39B8B)" }}>· {source.time}</span>
    </span>
  );
}

function ConfidenceTag({ value }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const low = pct < 80;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontFamily: "var(--dm-font-mono,monospace)", fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dm-text-faint,#A39B8B)" }}>conf</span>
      <span style={{ position: "relative", width: 46, height: 5, borderRadius: 3, background: "var(--dm-border-soft,#EFE9DC)", overflow: "hidden" }}>
        <span style={{ position: "absolute", inset: 0, width: pct + "%", borderRadius: 3, background: low ? "var(--dm-warning,#B08A2E)" : "var(--dm-success,#3F8F5B)" }} />
      </span>
      <span style={{ fontFamily: "var(--dm-font-mono,monospace)", fontSize: 11, color: low ? "var(--dm-warning,#B08A2E)" : "var(--dm-text-body-2,#57534A)" }}>{pct}%</span>
    </span>
  );
}

const primaryBtn = { border: "none", background: "var(--dm-accent,#E4593B)", color: "var(--dm-accent-on,#FFF8F4)", fontFamily: "var(--dm-font-body,sans-serif)", fontWeight: 600, fontSize: 12.5, padding: "7px 15px", borderRadius: 8, cursor: "pointer", transition: "background var(--dm-dur-fast,140ms) ease" };
const ghostBtn = { border: "1px solid var(--dm-border-2,#E1D9C8)", background: "transparent", color: "var(--dm-text-body,#514C43)", fontFamily: "var(--dm-font-body,sans-serif)", fontWeight: 500, fontSize: 12.5, padding: "7px 13px", borderRadius: 8, cursor: "pointer" };

function mdlite(s = "") {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, '<b style="color:var(--dm-ink,#211E18);font-weight:600">$1</b>')
    .replace(/\*(.+?)\*/g, '<i style="color:var(--dm-text-muted,#8A8477);font-style:normal;font-family:var(--dm-font-mono,monospace);font-size:12px">$1</i>');
}
