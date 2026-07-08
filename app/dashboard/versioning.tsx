"use client";

import { Fragment, useMemo, useState } from "react";
import { acceptProposalsAction, rejectProposalsAction } from "./actions";
import type { ReviewItem } from "@/lib/datamodo/types";
import { C, Hov, Segmented, DiffBadge, useAction, ghostBtn, fieldInput, monoLabel, pickColor, relTime, showVal } from "./ui";

/* ================================================================== */
/* VERSIONING TAB — the unified "pull request" over pending changes.   */
/* One review across every table, sliceable by agent / table / comm,   */
/* with accept mechanics: merge all, whole group, multi-select, or one  */
/* at a time. Every accept routes through acceptProposalsAction(ids).   */
/* ================================================================== */
type GroupBy = "agent" | "table" | "comm";

type ReviewGroup = {
  key: string;
  title: string;
  subtitle: string;
  avatarText: string;
  avatarBg: string;
  items: ReviewItem[];
  adds: number;
  updates: number;
  conflicts: number;
};

function tally(items: ReviewItem[]) {
  let adds = 0, updates = 0, conflicts = 0;
  for (const it of items) {
    if (it.kind === "add") adds++; else updates++;
    if (it.conflict) conflicts++;
  }
  return { adds, updates, conflicts };
}

function buildGroups(items: ReviewItem[], by: GroupBy): ReviewGroup[] {
  const order: string[] = [];
  const map = new Map<string, ReviewItem[]>();
  const keyOf = (it: ReviewItem) =>
    by === "agent" ? `a:${it.agent}` : by === "table" ? `t:${it.datasetId}` : `c:${it.batchId ?? it.id}`;
  for (const it of items) {
    const k = keyOf(it);
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k)!.push(it);
  }
  return order.map((k) => {
    const its = map.get(k)!;
    const first = its[0];
    const t = tally(its);
    let title: string, subtitle: string, avatarText: string, avatarBg: string;
    if (by === "agent") {
      title = first.agent;
      subtitle = `${new Set(its.map((i) => i.datasetName)).size} ${new Set(its.map((i) => i.datasetName)).size === 1 ? "table" : "tables"}`;
      avatarText = first.agent.charAt(0).toUpperCase();
      avatarBg = pickColor(first.agent);
    } else if (by === "table") {
      title = first.datasetName;
      subtitle = `${new Set(its.map((i) => i.agent)).size} ${new Set(its.map((i) => i.agent)).size === 1 ? "agent" : "agents"}`;
      avatarText = first.datasetName.charAt(0).toUpperCase();
      avatarBg = pickColor(first.datasetName);
    } else {
      title = first.sourceLabel ? `“${first.sourceLabel}”` : "Direct change";
      subtitle = `${first.agent} · ${first.datasetName}`;
      avatarText = "✉";
      avatarBg = pickColor(first.batchId ?? first.agent);
    }
    return { key: k, title, subtitle, avatarText, avatarBg, items: its, ...t };
  });
}

function CountPills({ adds, updates, conflicts }: { adds: number; updates: number; conflicts: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {adds > 0 && <DiffBadge color={C.green} bg="#EAF4EC" text={`+${adds} new`} />}
      {updates > 0 && <DiffBadge color="#4E627E" bg="#EEF1F6" text={`${updates} update${updates === 1 ? "" : "s"}`} />}
      {conflicts > 0 && <DiffBadge color="#fff" bg={C.accent} text={`${conflicts} conflict${conflicts === 1 ? "" : "s"}`} />}
    </span>
  );
}

export function VersioningTab({ items, onChanged, onGoData }: { items: ReviewItem[]; onChanged: () => void; onGoData: () => void }) {
  const [by, setBy] = useState<GroupBy>("agent");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { pending, error, run } = useAction();

  // Free-text filter across agent / table / source — a flexible way to narrow a
  // big review to "just Ledger's Acme invoices" without hunting through groups.
  const shown = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) => `${i.agent} ${i.datasetName} ${i.sourceLabel ?? ""}`.toLowerCase().includes(t));
  }, [items, query]);

  const groups = useMemo(() => buildGroups(shown, by), [shown, by]);
  const allIds = useMemo(() => shown.map((i) => i.id), [shown]);
  const totals = useMemo(() => tally(shown), [shown]);

  const accept = (ids: string[]) => { if (ids.length) run(() => acceptProposalsAction(ids), () => { setSelected(new Set()); onChanged(); }); };
  const reject = (ids: string[]) => { if (ids.length) run(() => rejectProposalsAction(ids), () => { setSelected(new Set()); onChanged(); }); };

  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setMany = (ids: string[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });

  if (items.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#EAF4EC", border: "1px solid #CBE4D2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
        </div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.03em", margin: "0 0 8px" }}>Everything’s merged</h2>
        <p style={{ fontSize: 15, color: "#57534A", maxWidth: "42ch", margin: "0 0 22px", lineHeight: 1.55 }}>No pending changes. When an agent parses a message or a synced sheet brings new data, the proposed changes land here as a reviewable pull request.</p>
        <Hov onClick={onGoData} base={{ ...ghostBtn, padding: "9px 16px" }} hover={{ background: "#FBF8F1" }}>Go to your data →</Hov>
      </div>
    );
  }

  const selectedIds = [...selected];

  return (
    <div style={{ maxWidth: 940 }}>
      {/* Header: the "PR" summary + merge/discard + grouping toggle. */}
      <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="dm-display" style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: C.ink }}>
              {shown.length} change{shown.length === 1 ? "" : "s"} {query.trim() ? "matched" : "waiting to merge"}
            </div>
            <div style={{ marginTop: 6 }}><CountPills adds={totals.adds} updates={totals.updates} conflicts={totals.conflicts} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Hov onClick={pending ? undefined : () => { if (allIds.length && confirm(`Merge all ${allIds.length} ${query.trim() ? "matched" : "pending"} change${allIds.length === 1 ? "" : "s"}?`)) accept(allIds); }}
              base={{ background: C.green, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }} hover={{ background: "#357C4C" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="9" r="2.4" /><path d="M6 8.4v7.2M8.3 6h5.2a3 3 0 0 1 3 3" /></svg>
              Merge all
            </Hov>
            <Hov onClick={pending ? undefined : () => { if (allIds.length && confirm(`Discard all ${allIds.length} ${query.trim() ? "matched" : "pending"} change${allIds.length === 1 ? "" : "s"}? This can't be undone.`)) reject(allIds); }}
              base={{ ...ghostBtn, color: "#B44536", borderColor: "#EAD7CF" }} hover={{ background: "#FDF4F0" }}>Discard all</Hov>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <span className="dm-mono" style={{ ...monoLabel }}>Group by</span>
          <div style={{ flex: "0 0 auto" }}>
            <Segmented value={by} onChange={(v: GroupBy) => setBy(v)} options={[{ v: "agent", label: "Agent" }, { v: "table", label: "Table" }, { v: "comm", label: "Comm chunk" }]} />
          </div>
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 12 }}>⌕</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by agent, table, message…"
              style={{ ...fieldInput, padding: "7px 10px 7px 26px", fontSize: 12.5, borderRadius: 9 }} />
            {query && <button type="button" onClick={() => setQuery("")} title="Clear" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", color: "#B7AF9F", cursor: "pointer", fontSize: 13 }}>✕</button>}
          </div>
          {error && <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{error}</span>}
          {pending && <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>Applying…</span>}
        </div>
      </div>

      {shown.length === 0 && (
        <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", textAlign: "center", padding: "30px 0" }}>
          No pending changes match “{query.trim()}”.
        </div>
      )}

      {/* Sticky multi-select action bar. */}
      {selectedIds.length > 0 && (
        <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 10, background: C.ink, color: "#F1ECE1", borderRadius: 12, padding: "10px 14px", marginBottom: 14, boxShadow: "0 12px 30px -14px rgba(33,30,24,.6)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.length} selected</span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
            <Hov onClick={pending ? undefined : () => accept(selectedIds)} base={{ background: C.green, color: "#fff", border: "none", borderRadius: 9, padding: "7px 14px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }} hover={{ background: "#357C4C" }}>Accept selected</Hov>
            <Hov onClick={pending ? undefined : () => reject(selectedIds)} base={{ background: "none", color: "#E9B8AC", border: "1px solid #5A4038", borderRadius: 9, padding: "7px 14px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }} hover={{ background: "#3A352C" }}>Reject selected</Hov>
            <Hov onClick={() => setSelected(new Set())} base={{ background: "none", color: "#A39B8B", border: "none", padding: "7px 8px", fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }} hover={{ color: "#F1ECE1" }}>Clear</Hov>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <ReviewGroupCard key={g.key} group={g} pending={pending} selected={selected}
          onToggleItem={toggleOne} onSetMany={setMany}
          onAccept={(ids) => accept(ids)} onReject={(ids) => reject(ids)} />
      ))}
    </div>
  );
}

function ReviewGroupCard({ group, pending, selected, onToggleItem, onSetMany, onAccept, onReject }: {
  group: ReviewGroup;
  pending: boolean;
  selected: Set<string>;
  onToggleItem: (id: string) => void;
  onSetMany: (ids: string[], on: boolean) => void;
  onAccept: (ids: string[]) => void;
  onReject: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const ids = group.items.map((i) => i.id);
  const allSel = ids.every((id) => selected.has(id));
  const someSel = !allSel && ids.some((id) => selected.has(id));
  const hot = group.conflicts > 0;
  return (
    <div style={{ border: `1px solid ${hot ? "#F3D6CB" : "#E7E0D2"}`, borderRadius: 14, background: "#fff", marginBottom: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", background: hot ? "#FDF4F0" : "#FBF8F1", borderBottom: open ? `1px solid ${hot ? "#F3D6CB" : "#EFE9DC"}` : "none", flexWrap: "wrap" }}>
        <button type="button" title={allSel ? "Deselect group" : "Select group"} onClick={() => onSetMany(ids, !allSel)}
          style={{ width: 19, height: 19, borderRadius: 5, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, ...(allSel ? { background: C.accent, color: "#fff", border: `1px solid ${C.accent}` } : someSel ? { background: "#FDF1EC", color: C.accent, border: `1.5px solid ${C.accent}` } : { background: "#fff", color: "transparent", border: "1.5px solid #D8CFBD" }) }}>
          {allSel ? "✓" : someSel ? "–" : "✓"}
        </button>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: group.avatarBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{group.avatarText}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.title}</div>
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 1 }}>{group.subtitle}</div>
        </div>
        <CountPills adds={group.adds} updates={group.updates} conflicts={group.conflicts} />
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <Hov onClick={pending ? undefined : () => onAccept(ids)} base={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }} hover={{ background: "#357C4C" }}>Accept {group.items.length}</Hov>
          <Hov onClick={pending ? undefined : () => onReject(ids)} base={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }} hover={{ background: "#FDF4F0" }}>Reject</Hov>
          <Hov onClick={() => setOpen((v) => !v)} base={{ background: "none", border: "none", color: "#8A8477", cursor: "pointer", fontSize: 15, padding: "4px 6px" }} hover={{ color: C.ink }}>{open ? "▾" : "▸"}</Hov>
        </div>
      </div>
      {open && (
        <div style={{ padding: "12px 15px", display: "flex", flexDirection: "column", gap: 10 }}>
          {group.items.map((it) => (
            <ReviewItemCard key={it.id} item={it} pending={pending} checked={selected.has(it.id)}
              onToggle={() => onToggleItem(it.id)} onAccept={() => onAccept([it.id])} onReject={() => onReject([it.id])} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewItemCard({ item, pending, checked, onToggle, onAccept, onReject }: {
  item: ReviewItem;
  pending: boolean;
  checked: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const changedCells = item.cells.filter((c) => c.changed);
  const conflict = item.conflict;
  return (
    <div style={{ border: `1px solid ${conflict ? "#F3D6CB" : checked ? "#E4593B" : "#E7E0D2"}`, borderRadius: 11, background: conflict ? "#FDF4F0" : checked ? "#FEFAF8" : "#fff", padding: "11px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <button type="button" onClick={onToggle} title={checked ? "Deselect" : "Select"}
          style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, ...(checked ? { background: C.accent, color: "#fff", border: `1px solid ${C.accent}` } : { background: "#fff", color: "transparent", border: "1.5px solid #D8CFBD" }) }}>✓</button>
        {item.kind === "add"
          ? <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: C.green, fontSize: 15, lineHeight: 1 }}>＋</span>New row</span>
          : <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Update to an existing row</span>}
        <span className="dm-mono" style={{ fontSize: 10.5, color: "#57534A", background: "#F6F2E9", border: "1px solid #ECE5D8", borderRadius: 6, padding: "2px 8px" }}>{item.datasetName}</span>
        <span className="dm-mono" style={{ fontSize: 10.5, color: "#8A8477" }}>{item.agent} · {relTime(item.createdAt)}</span>
        {conflict && <span className="dm-mono" style={{ fontSize: 10, color: "#fff", background: C.accent, borderRadius: 999, padding: "1px 7px" }}>you edited this</span>}
        <div style={{ display: "flex", gap: 7, marginLeft: "auto" }}>
          <Hov onClick={pending ? undefined : onAccept} base={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "6px 13px", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }} hover={{ background: "#357C4C" }}>{conflict ? `Use ${item.agent}’s` : "Accept"}</Hov>
          <Hov onClick={pending ? undefined : onReject} base={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }} hover={{ background: "#FDF4F0" }}>{conflict ? "Keep mine" : "Reject"}</Hov>
        </div>
      </div>

      {conflict && <div style={{ fontSize: 12, color: "#8f5a3c", margin: "8px 0 4px" }}>You changed this row by hand — {item.agent} proposes different values. Accepting replaces yours.</div>}

      {item.kind === "add" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(90px,auto) 1fr", gap: "4px 14px", marginTop: 9, fontSize: 12.5 }}>
          {item.columns.map((c) => (
            <Fragment key={c.key}>
              <span style={{ color: "#8A8477" }}>{c.label}</span>
              <span style={{ color: C.green, fontWeight: 600 }}>{showVal(item.data[c.key])}</span>
            </Fragment>
          ))}
        </div>
      ) : changedCells.length === 0 ? (
        <div className="dm-mono" style={{ fontSize: 11.5, color: "#A39B8B", marginTop: 8 }}>No field changes.</div>
      ) : (
        <div style={{ marginTop: 9, border: "1px solid #EFE9DC", borderRadius: 9, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(90px,auto) 1fr 1fr", background: "#FAF6EE", fontSize: 9.5, letterSpacing: "0.04em", textTransform: "uppercase", color: "#A39B8B", padding: "5px 10px", gap: 12 }} className="dm-mono">
            <span>Field</span><span>{conflict ? "Yours" : "Was"}</span><span style={{ color: conflict ? C.accent : C.green }}>{conflict ? item.agent : "Now"}</span>
          </div>
          {changedCells.map((c) => (
            <div key={c.key} style={{ display: "grid", gridTemplateColumns: "minmax(90px,auto) 1fr 1fr", gap: 12, padding: "6px 10px", borderTop: "1px solid #F1EDE4", fontSize: 12.5, alignItems: "center" }}>
              <span style={{ color: "#8A8477" }}>{c.label}</span>
              <span style={{ color: "#B44536", textDecoration: "line-through" }}>{showVal(c.before)}</span>
              <span style={{ color: conflict ? C.accent : C.green, fontWeight: 600 }}>{showVal(c.after)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
