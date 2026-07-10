import React from "react";
import { Badge } from "../core/Badge.jsx";

/**
 * datamodo DataTable — the warm spreadsheet grid used in "watch it work" and
 * the dashboard. Mono uppercase header, hairline dividers, an index column,
 * a "new" row highlight (accent left-border + tint), plus interactivity:
 *
 *  - SORTABLE headers (click to toggle ▲/▼; click again to clear).
 *  - Row HOVER accent + optional onRowClick.
 *  - Optional SELECTION column (checkboxes; select-all in the header).
 *  - Rich cells: plain, {mono}, {badge,text}, {confidence:0..1}, {source}.
 *
 * columns: [{ key, label, mono?, flex?, accent?, sortable?, align? }]
 * rows:    [{ id, cells:{ <key>: value | {badge,text} | {confidence} | {source} }, highlight? }]
 */
export function DataTable({
  columns = [],
  rows = [],
  sortable = true,
  selectable = false,
  onRowClick,
  defaultSort = null, // { key, dir: 'asc'|'desc' }
  style = {},
}) {
  const [sort, setSort] = React.useState(defaultSort);
  const [hoverRow, setHoverRow] = React.useState(null);
  const [checked, setChecked] = React.useState(() => new Set());

  const grid = (selectable ? "34px " : "") + "28px " + columns.map((c) => (c.flex ? c.flex : "1fr")).join(" ");

  const sortVal = (row, key) => {
    const c = row.cells?.[key];
    let v = c && typeof c === "object" ? (c.text ?? c.confidence ?? c.source ?? "") : c;
    if (typeof v === "string") { const num = parseFloat(v.replace(/[^0-9.\-]/g, "")); if (!isNaN(num) && /[0-9]/.test(v)) return num; }
    return v ?? "";
  };

  const sorted = React.useMemo(() => {
    if (!sort) return rows.map((r, i) => [r, i]);
    const arr = rows.map((r, i) => [r, i]);
    arr.sort((A, B) => {
      const a = sortVal(A[0], sort.key), b = sortVal(B[0], sort.key);
      let d = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return sort.dir === "desc" ? -d : d;
    });
    return arr;
  }, [rows, sort]);

  const toggleSort = (key) => {
    if (!sortable) return;
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  };

  const allChecked = rows.length > 0 && checked.size === rows.length;
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map((r, i) => r.id ?? i)));
  const toggleRow = (id) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const HEAD_BORDER = "1px solid var(--dm-border-soft,#EFE9DC)";

  const Check = ({ on, ...p }) => (
    <span
      {...p}
      role="checkbox" aria-checked={on} tabIndex={0}
      style={{
        width: 15, height: 15, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: on ? "1px solid var(--dm-accent,#E4593B)" : "1px solid var(--dm-border-3,#DDD5C5)",
        background: on ? "var(--dm-accent,#E4593B)" : "var(--dm-surface-pure,#fff)",
        color: "var(--dm-accent-on,#FFF8F4)", fontSize: 10, cursor: "pointer",
        transition: "background var(--dm-dur-fast,140ms) ease, border-color var(--dm-dur-fast,140ms) ease",
      }}
    >{on ? "✓" : ""}</span>
  );

  return (
    <div style={{ fontSize: 12.5, ...style }}>
      {/* header */}
      <div
        style={{
          display: "grid", gridTemplateColumns: grid,
          background: "var(--dm-surface-sunk, #FAF6EE)",
          fontFamily: "var(--dm-font-mono, monospace)", fontSize: 10,
          textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--dm-text-faint, #A39B8B)",
        }}
      >
        {selectable && (
          <span style={{ padding: "8px", borderRight: HEAD_BORDER, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check on={allChecked} onClick={toggleAll} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleAll())} />
          </span>
        )}
        <span style={{ padding: "9px 8px", borderRight: HEAD_BORDER, textAlign: "center" }}>#</span>
        {columns.map((c, i) => {
          const canSort = sortable && c.sortable !== false;
          const active = sort && sort.key === c.key;
          return (
            <span
              key={c.key}
              onClick={() => canSort && toggleSort(c.key)}
              style={{
                padding: "9px 12px", borderRight: i < columns.length - 1 ? HEAD_BORDER : "none",
                display: "flex", alignItems: "center", gap: 5, justifyContent: c.align === "right" ? "flex-end" : "flex-start",
                cursor: canSort ? "pointer" : "default", color: active ? "var(--dm-accent,#E4593B)" : "inherit",
                userSelect: "none", transition: "color var(--dm-dur-fast,140ms) ease",
              }}
            >
              {c.label}
              {canSort && (
                <span style={{ fontSize: 8, opacity: active ? 1 : 0.4, transform: "translateY(-0.5px)" }}>
                  {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲▼"}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* rows */}
      {sorted.map(([row, origIndex], ri) => {
        const hl = row.highlight;
        const id = row.id ?? origIndex;
        const isHover = hoverRow === id;
        const isChecked = checked.has(id);
        const divider = hl ? "1px solid var(--dm-accent-tint-border,#F3D6CB)" : "1px solid #F1EDE4";
        const bg = hl ? "var(--dm-accent-tint-2,#FDF1EC)" : isChecked ? "var(--dm-accent-tint,#FBEAE3)" : isHover ? "var(--dm-surface-sunk,#FAF6EE)" : "transparent";
        return (
          <div
            key={id}
            onMouseEnter={() => setHoverRow(id)} onMouseLeave={() => setHoverRow(null)}
            onClick={() => onRowClick && onRowClick(row)}
            style={{
              display: "grid", gridTemplateColumns: grid, borderTop: divider,
              color: hl ? "var(--dm-ink,#211E18)" : "var(--dm-text-body-2,#57534A)",
              fontWeight: hl ? 600 : 400, background: bg,
              boxShadow: hl ? "inset 3px 0 0 var(--dm-accent,#E4593B)" : isChecked ? "inset 3px 0 0 var(--dm-accent-tint-border,#F3D6CB)" : "none",
              cursor: onRowClick ? "pointer" : "default",
              transition: "background var(--dm-dur-fast,140ms) ease, box-shadow var(--dm-dur-fast,140ms) ease",
            }}
          >
            {selectable && (
              <span style={{ padding: "0 8px", borderRight: hl ? divider : "1px solid #F1EDE4", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                <Check on={isChecked} onClick={() => toggleRow(id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleRow(id))} />
              </span>
            )}
            <span
              style={{
                padding: "11px 8px", borderRight: hl ? divider : "1px solid #F1EDE4", textAlign: "center",
                background: hl || isHover || isChecked ? "transparent" : "#FBFAF7",
                color: hl ? "var(--dm-accent,#E4593B)" : "var(--dm-text-faint,#A39B8B)", fontWeight: hl ? 500 : 400,
                fontFamily: "var(--dm-font-mono, monospace)", fontSize: 11,
              }}
            >{ri + 1}</span>
            {columns.map((c, ci) => {
              const cell = row.cells?.[c.key];
              const obj = cell && typeof cell === "object" ? cell : null;
              return (
                <span
                  key={c.key}
                  style={{
                    padding: "11px 12px", borderRight: ci < columns.length - 1 ? divider : "none",
                    fontFamily: c.mono ? "var(--dm-font-mono, monospace)" : "inherit",
                    color: c.accent && hl ? "var(--dm-accent,#E4593B)" : "inherit",
                    justifyContent: c.align === "right" ? "flex-end" : "flex-start",
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                >
                  {obj && obj.badge != null ? <Badge variant={obj.badge}>{obj.text}</Badge>
                    : obj && obj.confidence != null ? <Confidence value={obj.confidence} />
                    : obj && obj.source != null ? <Source label={obj.source} />
                    : cell}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Confidence meter — a mono % + a thin coral bar. */
function Confidence({ value }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const low = pct < 70;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, width: "100%" }}>
      <span style={{ position: "relative", flex: 1, minWidth: 30, height: 5, borderRadius: 3, background: "var(--dm-border-soft,#EFE9DC)", overflow: "hidden" }}>
        <span style={{ position: "absolute", inset: 0, width: pct + "%", borderRadius: 3, background: low ? "var(--dm-warning,#B08A2E)" : "var(--dm-accent,#E4593B)", transition: "width var(--dm-dur-slow,420ms) var(--dm-ease-out,cubic-bezier(0.16,1,0.3,1))" }} />
      </span>
      <span style={{ fontFamily: "var(--dm-font-mono, monospace)", fontSize: 10.5, color: low ? "var(--dm-warning,#B08A2E)" : "var(--dm-text-muted,#8A8477)", minWidth: 26, textAlign: "right" }}>{pct}%</span>
    </span>
  );
}

/** Source tag — the channel a fact was extracted from. */
function Source({ label }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px 2px 7px", borderRadius: 999,
      border: "1px solid var(--dm-border-2,#E1D9C8)", background: "var(--dm-surface-pure,#fff)",
      fontFamily: "var(--dm-font-mono, monospace)", fontSize: 10, letterSpacing: ".02em", color: "var(--dm-text-body-2,#57534A)",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--dm-accent,#E4593B)" }} />
      {label}
    </span>
  );
}
