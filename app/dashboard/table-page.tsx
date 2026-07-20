"use client";

/**
 * TABLE PAGE — Notion's grammar on the fact spine (redesign 2026-07-20, brief:
 * design/briefs/tables-notion-redesign-brief.md). A table opens into a PAGE,
 * not a modal: a virtualized, keyboard-navigable typed GRID over windowed row
 * fetches, a SIDE PEEK that renders the selected row's entity in its natural
 * shape (row = page — the same EntityPageBody the Explorer panel uses), and a
 * Cards view demoted to a view-switcher option. Presentation only: cells stay
 * facts with provenance; edits ride the same server actions + human-edit
 * protection as before. Per-table view config (view, sort, column order &
 * visibility) persists in localStorage — no schema change (dm-table-view-v1).
 *
 * TanStack (headless) owns the sorted row model; markup, focus, editing and
 * virtualization are ours. All window/coercion/ordering math lives in the
 * pure core lib/datamodo/table-view.ts (unit-tested).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  addColumnAction,
  addRowAction,
  deleteDatasetAction,
  deleteRowAction,
  getDatasetRowsAction,
  getSnapshotsAction,
  removeColumnAction,
  renameDatasetAction,
  restoreSnapshotAction,
  updateRowAction,
} from "./actions";
import {
  C, Hov, monoLabel, fieldInput, fieldLabel, ghostBtn, primaryBtn, relTime, showVal,
  pickColor, COLUMN_TYPES, Segmented, DiffBadge, useAction,
} from "./ui";
import { EntityPageBody, EntityPageModal } from "./entity-page";
import { safeTableName } from "@/lib/datamodo/sync-postgres";
import {
  ROW_PAGE_SIZE,
  coerceCell,
  compareCells,
  defaultViewConfig,
  diffSnapshots,
  formatCell,
  isEmptyCell,
  moveCell,
  nextPage,
  orderColumns,
  rowMatchesFilter,
  rowProvenance,
  sanitizeViewConfig,
  viewStorageKey,
  visibleRange,
  type SnapDiff,
  type TableViewConfig,
} from "@/lib/datamodo/table-view";
import type { DatasetColumn, DatasetRowRecord, DatasetView, KnowledgeEntityView, SnapshotFull } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

const ROW_H = 34;
const PEEK_W = 380;

/* ------------------------------------------------------------------ */
/* View-config persistence (localStorage — the schema-canvas precedent) */
/* ------------------------------------------------------------------ */

function loadViewConfig(tableId: string): TableViewConfig {
  if (typeof window === "undefined") return defaultViewConfig();
  try {
    const raw = window.localStorage.getItem(viewStorageKey(tableId));
    return sanitizeViewConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultViewConfig();
  }
}

function saveViewConfig(tableId: string, cfg: TableViewConfig) {
  try {
    window.localStorage.setItem(viewStorageKey(tableId), JSON.stringify(cfg));
  } catch { /* private mode etc. — the view just resets next visit */ }
}

/* ------------------------------------------------------------------ */
/* Import a sheet (shared with the dataset list in control-center)      */
/* ------------------------------------------------------------------ */

export type ImportDone = { mode: string; datasetId?: string; added?: number; changed?: number; rows?: number };

/**
 * Upload a spreadsheet to seed a new table, or to sync one (incoming rows land
 * as reviewable proposals). v1 stand-in for the live Google Sheets pull.
 */
export function ImportSheetButton({ datasetId, label, style, hoverStyle, onDone }: {
  datasetId?: string;
  label: ReactNode;
  style: CSSProperties;
  hoverStyle?: CSSProperties;
  onDone: (r: ImportDone) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (datasetId) fd.append("datasetId", datasetId);
      const res = await fetch("/api/datasets/import", { method: "POST", body: fd });
      const data = (await res.json()) as ImportDone & { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) { setErr(data.error ?? "Import failed."); return; }
      onDone(data);
    } catch {
      setErr("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx" onChange={onFile} style={{ display: "none" }} />
      <Hov onClick={busy ? undefined : () => inputRef.current?.click()} base={style} hover={hoverStyle}>
        {busy ? "Importing…" : label}
      </Hov>
      {err && <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{err}</span>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Outbound sync (phase 1): push rows into the user's OWN Postgres      */
/* ------------------------------------------------------------------ */

/* Every view is a projection; an external DB is just another projection
 * target. Idempotent upsert by the datamodo row id; the connection string is
 * used for the request only, never stored. */
function SyncOutPanel({ datasetId, tableName }: { datasetId: string; tableName: string }) {
  const [conn, setConn] = useState("");
  const [target, setTarget] = useState(() => safeTableName(tableName));
  const [state, setState] = useState<"idle" | "syncing">("idle");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sync = async () => {
    setState("syncing"); setResult(null);
    try {
      const res = await fetch("/api/sync/postgres", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ datasetId, connectionString: conn.trim(), table: target.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setResult({ ok: true, msg: `Synced ${json.synced} row${json.synced === 1 ? "" : "s"} into "${json.table}".` });
      else setResult({ ok: false, msg: json.error ?? "Sync failed." });
    } catch {
      setResult({ ok: false, msg: "Couldn't reach the sync endpoint." });
    } finally {
      setState("idle");
    }
  };

  return (
    <div style={{ marginBottom: 14, padding: "14px 16px", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Push to your own Postgres</div>
      <div style={{ fontSize: 12, color: "#8A8477", marginTop: 2, marginBottom: 12, lineHeight: 1.5 }}>
        One-way, idempotent — re-syncing upserts by each row&apos;s datamodo id, never duplicates. The connection string is used once and never stored.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 6 }}>Connection string</div>
          <input type="password" value={conn} onChange={(e) => setConn(e.target.value)} placeholder="postgres://user:pass@host:5432/dbname" style={fieldInput} />
        </div>
        <div>
          <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 6 }}>Target table</div>
          <input type="text" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="datamodo_table" style={fieldInput} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
          <Hov onClick={state === "syncing" || !conn.trim() ? undefined : () => void sync()} base={{ ...primaryBtn(state === "syncing" || !conn.trim()), padding: "9px 16px", fontSize: 13 }} hover={{ background: C.accentPress }}>
            {state === "syncing" ? "Syncing…" : "↑ Sync now"}
          </Hov>
          {result && <span className="dm-mono" style={{ fontSize: 11.5, color: result.ok ? C.green : C.accent }}>{result.msg}</span>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Version history (timeline + preview + restore)                       */
/* ------------------------------------------------------------------ */

/** Inline table showing exactly what a version contained; rows that were added
 *  or changed since the previous version are tinted so the diff is visible. */
function SnapshotPreview({ snap, diff }: { snap: SnapshotFull; diff: SnapDiff | null }) {
  const cols = snap.columns;
  if (cols.length === 0) return <div className="dm-mono" style={{ fontSize: 11.5, color: "#A39B8B", marginTop: 8 }}>No columns in this version.</div>;
  const cellBorder = "1px solid #F1EDE4";
  return (
    <div style={{ marginTop: 10, border: "1px solid #EFE9DC", borderRadius: 9, overflow: "auto", maxHeight: 220 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#FAF6EE" }}>
            {cols.map((c) => <th key={c.key} style={{ textAlign: "left", padding: "6px 9px", borderRight: cellBorder, borderBottom: cellBorder, color: "#7A7367", fontWeight: 600, whiteSpace: "nowrap" }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {snap.rows.length === 0 && <tr><td colSpan={cols.length} className="dm-mono" style={{ padding: "10px", color: "#A39B8B", textAlign: "center" }}>Empty in this version.</td></tr>}
          {snap.rows.map((r, idx) => {
            const added = diff?.added.has(idx);
            const changed = diff?.changed.has(idx);
            const bg = added ? "#EAF4EC" : changed ? "#F9F4E7" : idx % 2 ? "#FCFAF4" : "#fff";
            return (
              <tr key={idx} style={{ background: bg }}>
                {cols.map((c) => (
                  <td key={c.key} style={{ padding: "6px 9px", borderRight: cellBorder, borderTop: cellBorder, color: "#3A352C", whiteSpace: "nowrap" }}>{showVal(r.data?.[c.key])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Rich version-history panel: a timeline with per-version change counts, an
 *  inline preview of what the table looked like, and one-click restore. */
function HistoryPanel({ datasetId, onRestore, pending }: { datasetId: string; onRestore: (id: string) => void; pending: boolean }) {
  const [snaps, setSnaps] = useState<SnapshotFull[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getSnapshotsAction(datasetId).then((r) => {
      if (!live) return;
      if (r.ok) setSnaps(r.snapshots); else setErr(r.error);
    });
    return () => { live = false; };
  }, [datasetId]);

  return (
    <div style={{ marginBottom: 14, border: "1px solid #E7E0D2", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
      <div className="dm-mono" style={{ ...monoLabel, padding: "10px 14px", borderBottom: "1px solid #F1EDE4", margin: 0 }}>Version history — preview, compare & rewind</div>
      {err && <div className="dm-mono" style={{ fontSize: 12, color: C.accent, padding: "14px" }}>{err}</div>}
      {!snaps && !err && <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "14px" }}>Loading history…</div>}
      {snaps && snaps.length === 0 && <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "14px" }}>No versions yet. Every change you or an agent makes is saved here.</div>}
      {snaps && snaps.length > 0 && (
        <div style={{ maxHeight: 340, overflow: "auto" }}>
          {snaps.map((s, i) => {
            const you = s.actor === "You";
            const prev = snaps[i + 1];                       // the older version
            const keyCol = s.columns[0]?.key;
            const d = prev ? diffSnapshots(prev.rows, s.rows, keyCol) : null;
            const isOpen = openId === s.id;
            const dot = you ? C.ink : C.accent;
            return (
              <div key={s.id} style={{ borderTop: i === 0 ? "none" : "1px solid #F5F1E8" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px" }}>
                  {/* timeline rail */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch", flexShrink: 0 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: dot, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{you ? "Y" : s.actor.charAt(0).toUpperCase()}</span>
                    {i !== snaps.length - 1 && <span style={{ flex: 1, width: 2, background: "#EDE7DA", marginTop: 2 }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "#3A352C", fontWeight: 500 }}>{s.summary}</span>
                      {i === 0 && <span className="dm-mono" style={{ fontSize: 9.5, color: C.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</span>}
                    </div>
                    <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 2 }}>{you ? "You" : s.actor} · {relTime(s.createdAt)} · {s.rows.length} {s.rows.length === 1 ? "row" : "rows"}</div>
                    {d && (d.added.size || d.changed.size || d.removed) ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {d.added.size > 0 && <DiffBadge color={C.green} bg="#EAF4EC" text={`+${d.added.size} added`} />}
                        {d.changed.size > 0 && <DiffBadge color={C.gold} bg="#F6F0E0" text={`${d.changed.size} changed`} />}
                        {d.removed > 0 && <DiffBadge color={C.accent} bg="#FBE9E3" text={`−${d.removed} removed`} />}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Hov onClick={() => setOpenId(isOpen ? null : s.id)} base={{ ...ghostBtn, padding: "4px 10px", fontSize: 11.5 }} hover={{ background: "#FBF8F1" }}>{isOpen ? "Hide" : "Preview"}</Hov>
                      {i !== 0 && <Hov onClick={pending ? undefined : () => { if (confirm("Rewind the table to this version? Your current rows are saved to history first.")) onRestore(s.id); }} base={{ ...ghostBtn, padding: "4px 10px", fontSize: 11.5 }} hover={{ background: "#FBF8F1" }}>Restore</Hov>}
                    </div>
                    {isOpen && <SnapshotPreview snap={s} diff={d} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side peek: the row opened as its entity's page (row = page)          */
/* ------------------------------------------------------------------ */

function RowPeek({ row, columns, kindDef, tone, onClose, onSaveRow, onExplore, onFullPage, entityCache }: {
  row: DatasetRowRecord;
  columns: DatasetColumn[];
  kindDef?: KindDef;
  tone: string;
  onClose: () => void;
  /** Hand-added rows have no entity — they edit as plain fields. */
  onSaveRow: (data: Record<string, unknown>) => void;
  onExplore?: (entityId: string) => void;
  onFullPage: (e: KnowledgeEntityView) => void;
  /** Fetched entities, cached per id for the whole page visit. */
  entityCache: Map<string, KnowledgeEntityView>;
}) {
  const entityId = row.subjectEntityId;
  // The entity is DERIVED from the cache (a ref Map shared for the whole page
  // visit); the effect only fetches misses and bumps a counter when one lands.
  const entity = entityId ? entityCache.get(entityId) ?? null : null;
  const [, bump] = useState(0);
  const [failedId, setFailedId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId || entityCache.has(entityId)) return;
    let alive = true;
    fetch(`/api/knowledge/entities/${entityId}`)
      .then(async (res) => {
        if (!alive) return;
        const json = res.ok ? await res.json() : null;
        if (!alive) return;
        if (json?.entity) {
          entityCache.set(entityId, json.entity);
          bump((n) => n + 1);
        } else setFailedId(entityId);
      })
      .catch(() => { if (alive) setFailedId(entityId); });
    return () => { alive = false; };
  }, [entityId, entityCache]);
  const state: "idle" | "loading" | "error" =
    !entityId || entity ? "idle" : failedId === entityId ? "error" : "loading";

  const title = entity?.label ?? formatCell(columns[0]?.type ?? "text", row.data?.[columns[0]?.key ?? ""]);

  return (
    <aside className="dm-peek" style={{ width: PEEK_W, flexShrink: 0, borderLeft: "1px solid #E7E0D2", background: "#FFFDF8", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #F1EDE4" }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(title || "?").charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.015em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title || "—"}</div>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B" }}>
            {entity ? `${kindDef?.label ?? entity.kind} · ${entity.edges} link${entity.edges === 1 ? "" : "s"}` : entityId ? "loading…" : "hand-added row"}
          </div>
        </div>
        <button type="button" onClick={onClose} title="Close (Esc)" style={{ border: "none", background: "none", color: "#8A8477", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>

      <div className="cc-scroll" style={{ flex: 1, overflow: "auto", padding: "14px 16px", minHeight: 0 }}>
        {entityId ? (
          state === "loading" ? (
            <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "14px 0" }}>Opening the row&apos;s page…</div>
          ) : state === "error" ? (
            <div className="dm-mono" style={{ fontSize: 12, color: C.accent, padding: "14px 0" }}>Couldn&apos;t load this row&apos;s entity.</div>
          ) : entity ? (
            <EntityPageBody e={entity} kindDef={kindDef} variant="flat" />
          ) : null
        ) : (
          <PlainRowEditor key={row.id} row={row} columns={columns} onSave={onSaveRow} />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: "1px solid #F1EDE4" }}>
        {entity && onExplore && (
          <button type="button" onClick={() => onExplore(entity.id)} title="Walk the graph from here" className="dm-mono"
            style={{ fontSize: 11, color: C.accent, border: "1px solid #F3D6CB", background: "#FDF6F2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>◍ Walk</button>
        )}
        {entity && (
          <button type="button" onClick={() => onFullPage(entity)} className="dm-mono"
            style={{ fontSize: 11, color: C.ink, border: "1px solid #DDD5C5", background: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>Full page ›</button>
        )}
        {entity && (
          <a href={`/api/knowledge/entities/${entity.id}/dossier`} title="Download everything we know about this, cited" className="dm-mono"
            style={{ fontSize: 11, color: C.ink, border: "1px solid #DDD5C5", background: "#fff", borderRadius: 8, padding: "6px 12px", textDecoration: "none", marginLeft: "auto" }}>dossier ↓</a>
        )}
        {!entityId && (
          <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>This row was added by hand — it has no page in the graph yet.</span>
        )}
      </div>
    </aside>
  );
}

/** Fallback editor for rows with no entity: plain fields, saved as one edit.
 *  Mounted with key={row.id} so switching rows resets the draft. */
function PlainRowEditor({ row, columns, onSave }: {
  row: DatasetRowRecord;
  columns: DatasetColumn[];
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, isEmptyCell(row.data?.[c.key]) ? "" : String(row.data?.[c.key])])));
  const dirty = columns.some((c) => (draft[c.key] ?? "") !== (isEmptyCell(row.data?.[c.key]) ? "" : String(row.data?.[c.key])));
  const save = () => {
    const data = { ...row.data };
    for (const c of columns) data[c.key] = coerceCell(c.type, draft[c.key] ?? "");
    onSave(data);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {columns.map((c) => (
        <div key={c.key}>
          <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 5 }}>{c.label} <span style={{ color: "#C9C1B0" }}>· {c.type}</span></div>
          <input
            type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"}
            value={draft[c.key] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
            style={{ ...fieldInput, padding: "8px 10px", fontSize: 13 }}
          />
        </div>
      ))}
      <Hov onClick={dirty ? save : undefined} base={{ ...primaryBtn(!dirty), padding: "8px 14px", fontSize: 12.5, alignSelf: "flex-start" }} hover={{ background: C.accentPress }}>Save row</Hov>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Column manager: show/hide + reorder (view config, not schema)        */
/* ------------------------------------------------------------------ */

function ColumnsPopover({ columns, cfg, onChange, onRemoveColumn, onClose }: {
  columns: DatasetColumn[];
  cfg: TableViewConfig;
  onChange: (next: TableViewConfig) => void;
  onRemoveColumn: (key: string, label: string) => void;
  onClose: () => void;
}) {
  // The full ordered list (visible AND hidden) — reorder works on this.
  const ordered = orderColumns(columns, { ...cfg, hidden: [] });
  const hidden = new Set(cfg.hidden);
  const move = (idx: number, delta: number) => {
    const keys = ordered.map((c) => c.key);
    const to = idx + delta;
    if (to < 0 || to >= keys.length) return;
    [keys[idx], keys[to]] = [keys[to], keys[idx]];
    onChange({ ...cfg, order: keys });
  };
  const toggle = (key: string) => {
    const next = hidden.has(key) ? cfg.hidden.filter((k) => k !== key) : [...cfg.hidden, key];
    onChange({ ...cfg, hidden: next });
  };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 45 }} />
      <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 46, background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, boxShadow: "0 14px 34px rgba(33,30,24,.16)", minWidth: 250, padding: "8px 0", maxHeight: 320, overflow: "auto" }}>
        <div className="dm-mono" style={{ ...monoLabel, padding: "2px 13px 7px" }}>Columns — show, hide & order</div>
        {ordered.map((c, i) => {
          const off = hidden.has(c.key);
          return (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 13px" }}>
              <button type="button" onClick={() => toggle(c.key)} title={off ? "Show column" : "Hide column"}
                style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, ...(off ? { background: "#fff", color: "transparent", border: "1.5px solid #D8CFBD" } : { background: C.ink, color: "#fff", border: `1px solid ${C.ink}` }) }}>✓</button>
              <span style={{ fontSize: 12.5, color: off ? "#A39B8B" : C.ink, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
              <span className="dm-mono" style={{ fontSize: 9, color: "#B7AF9F", textTransform: "uppercase" }}>{c.type}</span>
              <button type="button" onClick={() => move(i, -1)} title="Move left" disabled={i === 0} style={{ border: "none", background: "none", color: i === 0 ? "#E1D9C8" : "#8A8477", cursor: i === 0 ? "default" : "pointer", fontSize: 12, padding: 2 }}>‹</button>
              <button type="button" onClick={() => move(i, 1)} title="Move right" disabled={i === ordered.length - 1} style={{ border: "none", background: "none", color: i === ordered.length - 1 ? "#E1D9C8" : "#8A8477", cursor: i === ordered.length - 1 ? "default" : "pointer", fontSize: 12, padding: 2 }}>›</button>
              <button type="button" onClick={() => onRemoveColumn(c.key, c.label)} title="Remove column from the table (deletes its values)" style={{ border: "none", background: "none", color: "#B7AF9F", cursor: "pointer", fontSize: 13, padding: 2 }}>×</button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function TablePage({ table, onClose, onChanged, onExplore, onReview }: {
  table: DatasetView;
  /** Back to the Tables surface. */
  onClose: () => void;
  /** Something persistent changed — parent refreshes server props. */
  onChanged: () => void;
  /** Hand a row's entity to the Explorer walk. */
  onExplore?: (entityId: string) => void;
  /** Jump to the Review tab (pending agent proposals live there). */
  onReview?: () => void;
}) {
  const { pending, error, run } = useAction();
  const cols = table.columns;

  // ---- per-table saved view config (localStorage; sanitize on read) ----
  const [cfg, setCfg] = useState<TableViewConfig>(() => loadViewConfig(table.id));
  useEffect(() => { setCfg(loadViewConfig(table.id)); }, [table.id]);
  const updateCfg = (next: TableViewConfig) => { setCfg(next); saveViewConfig(table.id, next); };

  const visCols = useMemo(() => orderColumns(cols, cfg), [cols, cfg]);

  // ---- rows: progressive windowed fetch (first page = first paint) ----
  const [rows, setRows] = useState<DatasetRowRecord[] | null>(null);
  const [total, setTotal] = useState(table.rowCount);
  const [reloadSeed, setReloadSeed] = useState(0);
  const reload = () => setReloadSeed((s) => s + 1);
  useEffect(() => {
    let alive = true;
    setRows(null);
    (async () => {
      let loaded: DatasetRowRecord[] = [];
      let known: number | null = null;
      // First window paints immediately; the rest streams in behind it.
      for (;;) {
        const page = known === null ? { offset: 0, limit: ROW_PAGE_SIZE } : nextPage(loaded.length, known);
        if (!page || !alive) break;
        const r = await getDatasetRowsAction(table.id, page);
        if (!alive) return;
        if (!r.ok) { setRows((prev) => prev ?? []); return; }
        known = r.total;
        loaded = [...loaded, ...r.rows];
        setRows(loaded);
        setTotal(r.total);
      }
    })();
    return () => { alive = false; };
  }, [table.id, reloadSeed]);
  const loadedAll = rows !== null && rows.length >= total;

  // ---- quick filter (session-only) + sorted model (TanStack headless) ----
  const [filter, setFilter] = useState("");
  const filtered = useMemo(
    () => (rows ?? []).filter((r) => rowMatchesFilter(r.data, visCols, filter)),
    [rows, visCols, filter],
  );
  const sorting: SortingState = useMemo(
    () => (cfg.sort ? [{ id: cfg.sort.key, desc: cfg.sort.dir === "desc" }] : []),
    [cfg.sort],
  );
  const columnDefs = useMemo<ColumnDef<DatasetRowRecord>[]>(
    () =>
      visCols.map((c) => ({
        id: c.key,
        // Empty cells become undefined so sortUndefined pins them last in
        // EITHER direction (typed compare handles the rest).
        accessorFn: (r) => (isEmptyCell(r.data?.[c.key]) ? undefined : r.data?.[c.key]),
        sortUndefined: "last",
        sortingFn: (ra, rb, id) => compareCells(c.type, ra.getValue(id), rb.getValue(id)),
        sortDescFirst: false,
      })),
    [visCols],
  );
  const grid = useReactTable({
    data: filtered,
    columns: columnDefs,
    state: { sorting },
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const displayRows = grid.getRowModel().rows;

  const cycleSort = (key: string) => {
    const cur = cfg.sort;
    const next = !cur || cur.key !== key
      ? { key, dir: "asc" as const }
      : cur.dir === "asc" ? { key, dir: "desc" as const } : null;
    updateCfg({ ...cfg, sort: next });
  };

  // ---- focus / editing / peek ----
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; draft: string } | null>(null);
  const [peekRowId, setPeekRowId] = useState<string | null>(null);
  const [fullPageEntity, setFullPageEntity] = useState<KnowledgeEntityView | null>(null);
  const entityCache = useRef(new Map<string, KnowledgeEntityView>());
  const peekRow = peekRowId ? displayRows.find((r) => r.id === peekRowId)?.original ?? null : null;

  // The category def behind this table (one object: kind id = table id) —
  // colors the peek, labels the record table, powers "Full page ›".
  const [kindDef, setKindDef] = useState<KindDef | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/api/kinds")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive || !json) return;
        const defs = (json.kinds ?? []) as KindDef[];
        setKindDef(defs.find((k) => k.id === table.id));
      })
      .catch(() => { /* peek falls back to plain labels */ });
    return () => { alive = false; };
  }, [table.id]);
  const tone = kindDef?.color ?? pickColor(table.name);

  // ---- mutations (same server actions + protections as always) ----
  const patchRow = (rowId: string, data: Record<string, unknown>) =>
    run(() => updateRowAction(table.id, rowId, data), () => {
      setRows((prev) => prev?.map((r) => (r.id === rowId ? { ...r, data, humanEdited: true } : r)) ?? prev);
      onChanged();
    });
  const addRow = () =>
    run(() => addRowAction(table.id, Object.fromEntries(cols.map((c) => [c.key, null]))), () => { reload(); onChanged(); });
  const delRow = (id: string) =>
    run(() => deleteRowAction(table.id, id), () => {
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
      setTotal((t) => Math.max(0, t - 1));
      if (peekRowId === id) setPeekRowId(null);
      onChanged();
    });
  const removeCol = (key: string, label: string) => {
    if (confirm(`Remove column “${label}”? Its values are deleted from every row.`))
      run(() => removeColumnAction(table.id, key), () => { reload(); onChanged(); });
  };
  const delTable = () => {
    if (confirm(`Delete table “${table.name}” and all ${total} rows?`))
      run(() => deleteDatasetAction(table.id), () => { onClose(); onChanged(); });
  };
  const rename = () => {
    const n = prompt("Rename table", table.name);
    if (n && n.trim() && n.trim() !== table.name) run(() => renameDatasetAction(table.id, n.trim()), onChanged);
  };

  // ---- add-column panel ----
  const [addingCol, setAddingCol] = useState(false);
  const [colLabel, setColLabel] = useState("");
  const [colType, setColType] = useState("text");
  const [colDefault, setColDefault] = useState("");
  const submitCol = () => run(
    () => addColumnAction(table.id, { label: colLabel, type: colType, defaultValue: coerceCell(colType, colDefault) }),
    () => { setAddingCol(false); setColLabel(""); setColDefault(""); setColType("text"); reload(); onChanged(); },
  );

  // ---- versions (read-only past) + panels ----
  const [snaps, setSnaps] = useState<SnapshotFull[] | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getSnapshotsAction(table.id).then((r) => { if (alive && r.ok) setSnaps(r.snapshots); });
    return () => { alive = false; };
  }, [table.id, reloadSeed]);
  const viewingPast = versionId !== null;
  const pastSnap = viewingPast ? snaps?.find((s) => s.id === versionId) ?? null : null;
  const [panel, setPanel] = useState<"none" | "history" | "syncout">("none");
  const [colsOpen, setColsOpen] = useState(false);

  // ---- virtualization ----
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(480);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => { const h = es[0]?.contentRect.height; if (h) setViewH(h); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [cfg.view, viewingPast]);
  const raf = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setScrollTop(scrollRef.current?.scrollTop ?? 0));
  };
  const range = visibleRange(scrollTop, viewH, ROW_H, displayRows.length);

  // ---- keyboard: navigate → edit → escape → peek, no mouse needed ----
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!focus || editing) return;
    cellRefs.current.get(`${focus.r}:${focus.c}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focus, editing]);

  const startEdit = (r: number, c: number, seed?: string) => {
    const row = displayRows[r]?.original;
    const col = visCols[c];
    if (!row || !col) return;
    const cur = row.data?.[col.key];
    setEditing({ r, c, draft: seed ?? (isEmptyCell(cur) ? "" : String(cur)) });
  };
  // Guards the edit's exit: keyboard commit/cancel refocus the grid, which
  // fires the input's blur BEFORE React applies setEditing(null) — without
  // this ref the blur would re-commit (or commit a cancelled draft).
  const editExit = useRef(false);
  const commitEdit = (move?: "down" | "right") => {
    if (!editing || editExit.current) return;
    editExit.current = true;
    const row = displayRows[editing.r]?.original;
    const col = visCols[editing.c];
    if (row && col) {
      const next = coerceCell(col.type, editing.draft);
      if (JSON.stringify(next) !== JSON.stringify(isEmptyCell(row.data?.[col.key]) ? null : row.data?.[col.key])) {
        patchRow(row.id, { ...row.data, [col.key]: next });
      }
    }
    const pos = { r: editing.r, c: editing.c };
    setEditing(null);
    if (move) setFocus(moveCell(pos, move === "down" ? "down" : "tab", displayRows.length, visCols.length));
    else setFocus(pos);
    // Keyboard-driven exits hand DOM focus back to the grid so the flow
    // continues; blur-driven commits (a click elsewhere) must not steal it.
    if (move) scrollRef.current?.focus({ preventScroll: true });
    editExit.current = false;
  };
  const cancelEdit = () => {
    if (editExit.current) return;
    editExit.current = true;
    setEditing(null);
    scrollRef.current?.focus({ preventScroll: true });
    editExit.current = false;
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // the input owns its keys
    if (!displayRows.length || !visCols.length) return;
    const pos = focus ?? { r: 0, c: 0 };
    const nav = (key: Parameters<typeof moveCell>[1]) => {
      e.preventDefault();
      setFocus(moveCell(focus ? pos : { r: 0, c: 0 }, focus ? key : "up", displayRows.length, visCols.length));
    };
    switch (e.key) {
      case "ArrowUp": nav("up"); return;
      case "ArrowDown": nav("down"); return;
      case "ArrowLeft": nav("left"); return;
      case "ArrowRight": nav("right"); return;
      case "Tab": e.preventDefault(); setFocus(moveCell(pos, e.shiftKey ? "shiftTab" : "tab", displayRows.length, visCols.length)); return;
      case "Enter":
        e.preventDefault();
        if (!focus) { setFocus(pos); return; }
        // Enter on the row-title cell opens the side peek (row = page);
        // on any other cell it starts an edit.
        if (pos.c === 0) setPeekRowId(displayRows[pos.r]?.id ?? null);
        else startEdit(pos.r, pos.c);
        return;
      case " ":
        if (focus && pos.c === 0) { e.preventDefault(); setPeekRowId(displayRows[pos.r]?.id ?? null); }
        return;
      case "Escape":
        e.preventDefault();
        if (peekRowId) setPeekRowId(null); else setFocus(null);
        return;
      default:
        // Typing over a focused cell starts an edit seeded with the keystroke.
        if (focus && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          startEdit(pos.r, pos.c, e.key);
        }
    }
  };

  // ---- layout math ----
  const gridTemplate = `28px ${visCols.map(() => "minmax(150px, 1fr)").join(" ")} 34px`;
  const minW = 28 + visCols.length * 150 + 34;
  const rowSep = "1px solid #F3EEE3";
  const pendingProposals = table.proposals.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* ---------- header: back · identity · view switcher · filter ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Hov onClick={onClose} base={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6 }} hover={{ background: "#FBF8F1" }}>
          ◂ Tables
        </Hov>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{(table.name.charAt(0) || "T").toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{table.name}</div>
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>
            {total} {total === 1 ? "row" : "rows"} · {cols.length} {cols.length === 1 ? "column" : "columns"}{table.agentName ? ` · fed by ${table.agentName}` : ""}{rows !== null && !loadedAll ? ` · loading ${rows.length}/${total}…` : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {pendingProposals > 0 && (
            <button type="button" onClick={onReview} className="dm-mono" title="Agents proposed changes to this table — decide in Review"
              style={{ fontSize: 10.5, color: C.accent, background: "#FDF6F2", border: "1px solid #F3D6CB", borderRadius: 999, padding: "4px 10px", cursor: onReview ? "pointer" : "default", fontFamily: "inherit" }}>
              {pendingProposals} pending change{pendingProposals === 1 ? "" : "s"} ›
            </button>
          )}
          <Segmented value={cfg.view} onChange={(v) => updateCfg({ ...cfg, view: v })} options={[{ v: "grid", label: "Grid" }, { v: "cards", label: "Cards" }]} />
          <div style={{ position: "relative", minWidth: 180 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 12 }}>⌕</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter rows…"
              style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 9, padding: "7px 10px 7px 26px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ position: "relative" }}>
            <Hov onClick={() => setColsOpen((o) => !o)} base={colsOpen ? { ...ghostBtn, background: "#EFE9DC", display: "inline-flex", alignItems: "center", gap: 6 } : { ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6 }} hover={{ background: "#FBF8F1" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2" /><circle cx="8" cy="16" r="2" /></svg>
              Columns
            </Hov>
            {colsOpen && (
              <ColumnsPopover columns={cols} cfg={cfg} onChange={updateCfg} onRemoveColumn={(k, l) => { setColsOpen(false); removeCol(k, l); }} onClose={() => setColsOpen(false)} />
            )}
          </div>
        </div>
      </div>

      {/* ---------- actions strip (absorbed from the old modal) ---------- */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={versionId ?? "latest"} onChange={(e) => setVersionId(e.target.value === "latest" ? null : e.target.value)}
          title="View a saved version" style={{ ...ghostBtn, cursor: "pointer", paddingRight: 8 }}>
          <option value="latest">Latest (live)</option>
          {(snaps ?? []).map((s) => <option key={s.id} value={s.id}>{s.summary} · {relTime(s.createdAt)}</option>)}
        </select>
        {!viewingPast && <>
          <Hov onClick={addRow} base={ghostBtn} hover={{ background: "#FBF8F1" }}>+ Add row</Hov>
          <Hov onClick={() => setAddingCol((v) => !v)} base={ghostBtn} hover={{ background: "#FBF8F1" }}>+ Add column</Hov>
          <Hov onClick={rename} base={ghostBtn} hover={{ background: "#FBF8F1" }}>Rename</Hov>
        </>}
        <Hov onClick={() => setPanel((p) => p === "history" ? "none" : "history")} base={panel === "history" ? { ...ghostBtn, background: "#EFE9DC" } : ghostBtn} hover={{ background: "#FBF8F1" }}>History ({table.history.length})</Hov>
        {!viewingPast && (
          <>
            <Hov onClick={() => setPanel((p) => p === "syncout" ? "none" : "syncout")} base={panel === "syncout" ? { ...ghostBtn, background: "#EFE9DC", marginLeft: "auto" } : { ...ghostBtn, marginLeft: "auto" }} hover={{ background: "#FBF8F1" }}>↑ Sync out</Hov>
            <ImportSheetButton
              datasetId={table.id}
              label="⇅ Sync a sheet"
              style={ghostBtn}
              hoverStyle={{ background: "#FBF8F1" }}
              onDone={() => { setPanel("none"); reload(); onChanged(); }}
            />
            <Hov tag="a" href={`/api/datasets/${table.id}/export`} base={{ ...ghostBtn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }} hover={{ background: "#FBF8F1" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1E8E4E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 9v12" /></svg>
              Export Excel
            </Hov>
            <Hov onClick={delTable} base={{ background: "none", border: "none", color: "#B44536", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer", padding: "7px 6px" }} hover={{ color: "#8f2f23" }}>Delete table</Hov>
          </>
        )}
        {error && <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{error}</span>}
        {pending && <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>Saving…</span>}
      </div>

      {!viewingPast && panel === "syncout" && <SyncOutPanel datasetId={table.id} tableName={table.name} />}
      {!viewingPast && panel === "history" && <HistoryPanel datasetId={table.id} onRestore={(id) => run(() => restoreSnapshotAction(id), () => { setPanel("none"); reload(); onChanged(); })} pending={pending} />}

      {addingCol && !viewingPast && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: "12px", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11 }}>
          <input type="text" value={colLabel} onChange={(e) => setColLabel(e.target.value)} placeholder="Column name" style={{ ...fieldInput, flex: "1 1 140px", width: "auto" }} />
          <select value={colType} onChange={(e) => setColType(e.target.value)} style={{ ...fieldInput, width: 120, flex: "0 0 120px" }}>
            {COLUMN_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <input type="text" value={colDefault} onChange={(e) => setColDefault(e.target.value)} placeholder="Default (optional)" style={{ ...fieldInput, flex: "1 1 140px", width: "auto" }} />
          <Hov onClick={pending ? undefined : submitCol} base={primaryBtn(pending)} hover={{ background: C.accentPress }}>Add</Hov>
        </div>
      )}

      {/* ---------- content: past version / grid+peek / cards+peek ---------- */}
      {viewingPast ? (
        pastSnap ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <span className="dm-mono" style={{ fontSize: 11, color: "#8f5a3c", background: "#FBEFD6", border: "1px solid #E6CF92", borderRadius: 8, padding: "3px 9px" }}>Read-only · saved version from {new Date(pastSnap.createdAt).toLocaleString()}</span>
              <Hov onClick={pending ? undefined : () => run(() => restoreSnapshotAction(pastSnap.id), () => { setVersionId(null); reload(); onChanged(); })} base={ghostBtn} hover={{ background: "#FBF8F1" }}>Restore this version</Hov>
            </div>
            <SnapshotPreview snap={pastSnap} diff={null} />
          </div>
        ) : (
          <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "20px 0" }}>Loading version…</div>
        )
      ) : cols.length === 0 ? (
        <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "26px 4px" }}>No columns yet — “+ Add column” to start.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "stretch", border: "1px solid #E7E0D2", borderRadius: 13, background: "#fff", overflow: "hidden", minHeight: 0 }}>
          {/* ------ the view ------ */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {cfg.view === "grid" ? (
              <div
                ref={scrollRef}
                onScroll={onScroll}
                onKeyDown={onGridKeyDown}
                tabIndex={0}
                role="grid"
                aria-rowcount={displayRows.length}
                className="cc-scroll dm-tp-grid"
                style={{ overflow: "auto", outline: "none", height: "min(62vh, 640px)", minHeight: 280 }}
              >
                <div style={{ minWidth: minW }}>
                  {/* sticky header */}
                  <div style={{ display: "grid", gridTemplateColumns: gridTemplate, position: "sticky", top: 0, zIndex: 5, background: "#FBFAF7", borderBottom: rowSep }}>
                    <span />
                    {visCols.map((c) => {
                      const dir = cfg.sort?.key === c.key ? cfg.sort.dir : null;
                      return (
                        <button key={c.key} type="button" onClick={() => cycleSort(c.key)} title="Sort by this column"
                          style={{ background: "none", border: "none", padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", minWidth: 0 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%" }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#3A352C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                            <span className="dm-mono" style={{ fontSize: 9, color: dir ? C.accent : "#C9C1B0", flexShrink: 0 }}>{dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}</span>
                          </span>
                          <span className="dm-mono" style={{ display: "block", fontSize: 9, color: "#A39B8B", textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.type}</span>
                        </button>
                      );
                    })}
                    <span />
                  </div>

                  {/* virtualized body */}
                  <div style={{ position: "relative", height: Math.max(displayRows.length * ROW_H, ROW_H) }}>
                    {rows === null && (
                      <div className="dm-mono" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "#A39B8B" }}>Loading rows…</div>
                    )}
                    {rows !== null && displayRows.length === 0 && (
                      <div className="dm-mono" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "#A39B8B" }}>
                        {filter.trim() ? `Nothing matches “${filter.trim()}”.` : "No rows yet — “+ Add row” to create one."}
                      </div>
                    )}
                    {displayRows.slice(range.start, range.end).map((row, i) => {
                      const r = range.start + i;
                      const rec = row.original;
                      const prov = rowProvenance(rec);
                      const isPeeked = peekRowId === rec.id;
                      return (
                        <div key={rec.id} role="row" className="dm-tp-row"
                          style={{ position: "absolute", top: r * ROW_H, left: 0, right: 0, height: ROW_H, display: "grid", gridTemplateColumns: gridTemplate, alignItems: "stretch", borderBottom: rowSep, background: isPeeked ? "#FDF6F2" : r % 2 ? "#FCFBF8" : "#fff" }}>
                          <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span
                              title={prov === "human" ? "You made or edited this row — agents can’t overwrite it" : "Written by extraction — every value is a fact with sources (open the row to see them)"}
                              style={{ width: 7, height: 7, borderRadius: "50%", background: prov === "human" ? C.ink : C.accent, opacity: prov === "human" ? 1 : 0.75 }} />
                          </span>
                          {visCols.map((c, ci) => {
                            const isFocus = focus?.r === r && focus?.c === ci;
                            const edit = editing && editing.r === r && editing.c === ci ? editing : null;
                            const v = rec.data?.[c.key];
                            return (
                              <div
                                key={c.key}
                                role="gridcell"
                                ref={(el) => { if (el) cellRefs.current.set(`${r}:${ci}`, el); else cellRefs.current.delete(`${r}:${ci}`); }}
                                onClick={() => {
                                  scrollRef.current?.focus({ preventScroll: true });
                                  if (ci === 0) { setFocus({ r, c: ci }); setPeekRowId(rec.id); }
                                  else if (isFocus) startEdit(r, ci);
                                  else setFocus({ r, c: ci });
                                }}
                                style={{ position: "relative", minWidth: 0, display: "flex", alignItems: "center", cursor: ci === 0 ? "pointer" : "default", boxShadow: isFocus && !edit ? `inset 0 0 0 2px ${C.accent}` : undefined, borderRadius: isFocus && !edit ? 4 : undefined }}
                              >
                                {edit ? (
                                  <input
                                    autoFocus
                                    type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"}
                                    value={edit.draft}
                                    onChange={(e) => setEditing((ed) => ed && { ...ed, draft: e.target.value })}
                                    onBlur={() => commitEdit()}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); commitEdit("down"); }
                                      else if (e.key === "Tab") { e.preventDefault(); commitEdit("right"); }
                                      else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                                      e.stopPropagation();
                                    }}
                                    style={{ position: "absolute", inset: 0, width: "100%", border: `2px solid ${C.accent}`, borderRadius: 4, background: "#fff", fontFamily: "inherit", fontSize: 12.5, color: "#3A352C", padding: "0 8px", outline: "none", boxSizing: "border-box" }}
                                  />
                                ) : (
                                  <span className={c.type === "number" ? "dm-mono" : undefined}
                                    style={{ padding: "0 10px", fontSize: 12.5, color: isEmptyCell(v) ? "#C9C1B0" : ci === 0 ? C.ink : "#3A352C", fontWeight: ci === 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: c.type === "number" ? "right" : "left", boxSizing: "border-box" }}>
                                    {formatCell(c.type, v)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <button type="button" className="dm-tp-del" onClick={() => delRow(rec.id)} title="Delete row"
                              style={{ border: "none", background: "none", color: "#B7AF9F", cursor: "pointer", fontSize: 13, padding: "4px 6px" }}>✕</button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* ------ Cards view: the same rows, read as cards ------ */
              <div className="cc-scroll" style={{ overflow: "auto", height: "min(62vh, 640px)", minHeight: 280, padding: 14 }}>
                {rows === null && <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: 10 }}>Loading rows…</div>}
                {rows !== null && displayRows.length === 0 && (
                  <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: 10 }}>{filter.trim() ? `Nothing matches “${filter.trim()}”.` : "No rows yet."}</div>
                )}
                <div className="dm-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                  {displayRows.map((row) => {
                    const rec = row.original;
                    const prov = rowProvenance(rec);
                    const title = formatCell(visCols[0]?.type ?? "text", rec.data?.[visCols[0]?.key ?? ""]);
                    const chips = visCols.slice(1, 5).filter((c) => !isEmptyCell(rec.data?.[c.key]));
                    const isPeeked = peekRowId === rec.id;
                    return (
                      <button key={rec.id} type="button" onClick={() => setPeekRowId(rec.id)} title="Open this row's page"
                        style={{ textAlign: "left", background: "#fff", border: `1px solid ${isPeeked ? C.accent : "#ECE5D8"}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 9 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                          <span style={{ width: 26, height: 26, borderRadius: 8, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{(title === "—" ? "?" : title).charAt(0).toUpperCase()}</span>
                          <span className="dm-display" style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                          <span title={prov === "human" ? "You made or edited this row" : "Written by extraction"} style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: prov === "human" ? C.ink : C.accent, opacity: prov === "human" ? 1 : 0.75, flexShrink: 0 }} />
                        </span>
                        {chips.length > 0 && (
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {chips.map((c) => (
                              <span key={c.key} className="dm-mono" style={{ fontSize: 10.5, color: "#57534A", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 6, padding: "2px 7px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.label.toLowerCase()}: {formatCell(c.type, rec.data?.[c.key])}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* footer: honest counts */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderTop: rowSep, background: "#FBFAF7" }}>
              <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>
                {filter.trim() ? `${displayRows.length} of ${total} rows match` : `${total} ${total === 1 ? "row" : "rows"}`}
                {rows !== null && !loadedAll ? ` · loaded ${rows.length}` : ""}
              </span>
              <span className="dm-mono" style={{ fontSize: 10.5, color: "#C9C1B0", marginLeft: "auto" }}>
                ↑↓←→ move · Enter edit · Esc cancel · Enter on the first column opens the row
              </span>
            </div>
          </div>

          {/* ------ side peek ------ */}
          {peekRow && (
            <RowPeek
              row={peekRow}
              columns={visCols}
              kindDef={kindDef}
              tone={tone}
              onClose={() => setPeekRowId(null)}
              onSaveRow={(data) => patchRow(peekRow.id, data)}
              onExplore={onExplore}
              onFullPage={setFullPageEntity}
              entityCache={entityCache.current}
            />
          )}
        </div>
      )}

      {fullPageEntity && (
        <EntityPageModal
          e={fullPageEntity}
          kindDef={kindDef}
          onClose={() => setFullPageEntity(null)}
          onExplore={onExplore ? (id) => { setFullPageEntity(null); onExplore(id); } : undefined}
        />
      )}
    </div>
  );
}
