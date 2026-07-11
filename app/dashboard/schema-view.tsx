"use client";

/**
 * SCHEMA VIEW — "how your tables connect", a Supabase-style schema CANVAS
 * (IA decision 2026-07-11: Tables, Cards and Concepts are ONE feature — a
 * concept is just a kind, a kind is just a table's shape, cards are just a way
 * of displaying its rows).
 *
 * Every category renders as a TABLE CARD — template fields as typed column
 * rows, relations as coral FK rows — free-floating on a canvas: DRAG a card by
 * its header and the relation lines follow live (measured from the DOM every
 * frame while dragging). Positions persist locally (localStorage) so the
 * diagram stays the way you arranged it; auto-layout seeds first visit.
 * Click a header (without dragging) to browse that table's rows below.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { C } from "./ui";
import type { KindDef } from "@/lib/datamodo/ontology";

const micro = { fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase" as const, color: "#A39B8B" };

const CARD_W = 240;
const GAP_X = 60;
const GAP_Y = 26;
const POS_KEY = "dm-schema-positions-v1";

export interface SchemaTableRef {
  id: string;
  name: string;
  /** Structural "category = table" binding (datasets.kind_id → kinds.id).
   *  Null for hand-made tables and rows that predate the binding. */
  kindId?: string | null;
}

/** The dataset a kind materializes into. The structural binding
 *  (datasets.kind_id, model unification phase 2) wins; the historical naming
 *  rule (plural, else label+"s"; case-insensitive) remains as a fallback for
 *  datasets that predate it. */
export function datasetForKind(def: KindDef, tables: SchemaTableRef[]): SchemaTableRef | null {
  if (def.id) {
    const bound = tables.find((t) => t.kindId === def.id);
    if (bound) return bound;
  }
  const want = (def.plural?.trim() || `${def.label}s`).toLowerCase();
  return tables.find((t) => !t.kindId && t.name.toLowerCase() === want) ?? null;
}

/** An explicit table↔table link (dataset_relations) — drawn as a DASHED line
 *  between the two tables' cards, distinct from the coral template-FK rows. */
export interface SchemaTableLink {
  fromDatasetId: string;
  fromColumn: string;
  toDatasetId: string;
  toColumn: string;
  label: string | null;
}

type Pos = { x: number; y: number };

/** Estimated card height (header + rows + footer) — good enough to seed a
 *  non-overlapping first layout; dragging owns it from there. */
const estHeight = (def: KindDef) =>
  34 + Math.max(1, def.fields.length + def.relations.length) * 21 + 38;

/** Deterministic first-visit layout: column-packed, most-populated first. */
function autoLayout(kinds: KindDef[], counts: Map<string, number>, width: number): Record<string, Pos> {
  const cols = Math.max(1, Math.floor((width + GAP_X) / (CARD_W + GAP_X)));
  const colY: number[] = Array.from({ length: cols }, () => 0);
  const ordered = [...kinds].sort(
    (a, b) => (counts.get(b.kind) ?? 0) - (counts.get(a.kind) ?? 0) || a.label.localeCompare(b.label),
  );
  const pos: Record<string, Pos> = {};
  for (const def of ordered) {
    const col = colY.indexOf(Math.min(...colY));
    pos[def.kind] = { x: col * (CARD_W + GAP_X), y: colY[col] };
    colY[col] += estHeight(def) + GAP_Y;
  }
  return pos;
}

function loadSaved(): Record<string, Pos> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(POS_KEY) ?? "{}") as Record<string, Pos>;
  } catch {
    return {};
  }
}

interface Line { x1: number; y1: number; x2: number; y2: number; label: string; from: string; to: string; dashed?: boolean }

export function SchemaView({ kinds, countByKind, tables, tableLinks = [], selectedKind, onSelectKind, onOpenTable, onMaterialized }: {
  kinds: KindDef[];
  countByKind: Map<string, number>;
  tables: SchemaTableRef[];
  /** Explicit table↔table relationships (dataset_relations) — dashed lines. */
  tableLinks?: SchemaTableLink[];
  /** The kind whose rows are being browsed below (cards grid). */
  selectedKind: string | null;
  onSelectKind: (kind: string | null) => void;
  /** Open a materialized dataset (the table modal). */
  onOpenTable?: (datasetId: string) => void;
  /** A table was just created from a category — parent refreshes its list. */
  onMaterialized?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const relRefs = useRef(new Map<string, HTMLDivElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [canvasW, setCanvasW] = useState(960);
  const [positions, setPositions] = useState<Record<string, Pos>>(() => loadSaved());
  const [dragging, setDragging] = useState<string | null>(null);
  // Bring-to-front: each grab bumps the card above everything grabbed before.
  const [zOrder, setZOrder] = useState<Record<string, number>>({});
  const zCounter = useRef(1);
  const dragRef = useRef<{ kind: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const known = useMemo(() => new Set(kinds.map((k) => k.kind)), [kinds]);

  // Canvas width drives the auto-layout; ResizeObserver keeps it honest.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setCanvasW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Seed positions for kinds the saved layout doesn't know (first visit, or a
  // category created since). Runs in an event-ish effect but only ever ADDS
  // missing entries — user-dragged positions are never overwritten.
  const laidOut = useMemo(() => {
    const auto = autoLayout(kinds, countByKind, canvasW);
    const merged: Record<string, Pos> = {};
    for (const k of kinds) merged[k.kind] = positions[k.kind] ?? auto[k.kind];
    return merged;
  }, [kinds, countByKind, canvasW, positions]);

  const canvasH = useMemo(() => {
    let h = 320;
    for (const k of kinds) {
      const p = laidOut[k.kind];
      if (p) h = Math.max(h, p.y + estHeight(k) + 30);
    }
    return h;
  }, [kinds, laidOut]);

  // Which kind card carries each dataset (structural binding, name fallback) —
  // dataset_relations reference datasets, but the canvas draws kind cards.
  const kindByDataset = useMemo(() => {
    const m = new Map<string, string>();
    for (const def of kinds) {
      const ds = datasetForKind(def, tables);
      if (ds) m.set(ds.id, def.kind);
    }
    return m;
  }, [kinds, tables]);

  /* ---- relation lines: FK row edge → target card edge, live-measured ---- */
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const out: Line[] = [];
    for (const k of kinds) {
      for (const r of k.relations) {
        if (!r.targetKind || !known.has(r.targetKind) || r.targetKind === k.kind) continue;
        const rowEl = relRefs.current.get(`${k.kind}~${r.predicate}`);
        const target = cardRefs.current.get(r.targetKind);
        if (!rowEl || !target) continue;
        const a = rowEl.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        const fromRight = b.left + b.width / 2 >= a.left + a.width / 2;
        const x1 = (fromRight ? a.right : a.left) - wr.left;
        const y1 = a.top + a.height / 2 - wr.top;
        const x2 = (fromRight ? b.left : b.right) - wr.left;
        const y2 = b.top + Math.min(17, b.height / 2) - wr.top;
        out.push({ x1, y1, x2, y2, label: r.predicate.replace(/_/g, " "), from: k.kind, to: r.targetKind });
      }
    }
    // Explicit table↔table links (dataset_relations) — DASHED, card footer to
    // card footer (they belong to the tables, not to a template row).
    for (const l of tableLinks) {
      const fromKind = kindByDataset.get(l.fromDatasetId);
      const toKind = kindByDataset.get(l.toDatasetId);
      if (!fromKind || !toKind || fromKind === toKind) continue;
      const fromEl = cardRefs.current.get(fromKind);
      const toEl = cardRefs.current.get(toKind);
      if (!fromEl || !toEl) continue;
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      const fromRight = b.left + b.width / 2 >= a.left + a.width / 2;
      out.push({
        x1: (fromRight ? a.right : a.left) - wr.left,
        y1: a.bottom - 19 - wr.top,
        x2: (fromRight ? b.left : b.right) - wr.left,
        y2: b.bottom - 19 - wr.top,
        label: l.label?.trim() || `${l.fromColumn.replace(/_/g, " ")} → ${l.toColumn.replace(/_/g, " ")}`,
        from: fromKind,
        to: toKind,
        dashed: true,
      });
    }
    setLines(out);
  }, [kinds, known, tableLinks, kindByDataset]);

  useEffect(() => {
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [measure, laidOut]);

  /* ---- drag: header grabs the card; a <4px move is a click (select) ---- */
  const onCardPointerDown = (kind: string) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const p = laidOut[kind];
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y, moved: false };
    zCounter.current += 1;
    setZOrder((prev) => ({ ...prev, [kind]: zCounter.current }));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onCardPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; setDragging(d.kind); }
    const x = Math.max(0, d.origX + dx);
    const y = Math.max(0, d.origY + dy);
    setPositions((prev) => ({ ...prev, [d.kind]: { x, y } }));
    requestAnimationFrame(measure);
  };
  const onCardPointerUp = (kind: string) => () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    if (d?.moved) {
      // Persist the arrangement — the diagram stays the way you left it.
      try {
        const saved = loadSaved();
        const p = positions[kind] ?? laidOut[kind];
        window.localStorage.setItem(POS_KEY, JSON.stringify({ ...saved, ...positions, [kind]: p }));
      } catch { /* private mode etc. — layout just re-seeds next visit */ }
    } else {
      onSelectKind(selectedKind === kind ? null : kind);
    }
  };

  /* ---- ONE OBJECT: "+ new table" creates the category AND its dataset ---- */
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createKindTable = async () => {
    const label = newName.trim();
    if (!label || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const kres = await fetch("/api/kinds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const kjson = await kres.json().catch(() => ({}));
      if (!kres.ok || !kjson.kind?.id) throw new Error(String(kjson.error ?? "could not create"));
      const tres = await fetch(`/api/kinds/${kjson.kind.id}/table`, { method: "POST" });
      const tjson = await tres.json().catch(() => ({}));
      setNewName("");
      onMaterialized?.();
      if (tres.ok && tjson.datasetId) onOpenTable?.(tjson.datasetId);
    } catch (e) {
      setCreateError(String((e as Error)?.message ?? "could not create"));
    } finally {
      setCreating(false);
    }
  };

  const materialize = async (def: KindDef) => {
    if (!def.id || busyKind) return;
    setBusyKind(def.kind);
    try {
      const res = await fetch(`/api/kinds/${def.id}/table`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        onMaterialized?.();
        if (json.datasetId) onOpenTable?.(json.datasetId);
      }
    } finally {
      setBusyKind(null);
    }
  };

  return (
    <div>
      {/* toolbar: hint + the one-object creation flow */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="dm-mono" style={{ ...micro }}>drag a table to arrange · click one to browse its rows</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createKindTable(); }}
            placeholder="New table (= new category)…"
            title="One object: creates the category AND its editable table together"
            style={{ border: "1px solid #DDD5C5", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, background: "#fff", outline: "none", width: 210 }}
          />
          <button type="button" onClick={createKindTable} disabled={creating || !newName.trim()} className="dm-mono"
            style={{ fontSize: 10.5, color: newName.trim() ? "#fff" : "#A39B8B", background: newName.trim() ? C.accent : "#F1ECDF", border: "none", borderRadius: 8, padding: "7px 12px", cursor: creating || !newName.trim() ? "default" : "pointer", fontFamily: "inherit", opacity: creating ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {creating ? "creating…" : "+ create"}
          </button>
          {createError && <span className="dm-mono" style={{ fontSize: 10, color: "#A0522D" }}>{createError}</span>}
        </div>
      </div>

      {/* the canvas */}
      <div style={{ overflowX: "auto", border: "1px solid #E7E0D2", borderRadius: 14, background: "repeating-linear-gradient(0deg, #F6F2E9, #F6F2E9 23px, #F1ECDF 23px, #F1ECDF 24px), #F6F2E9" }}>
        <div ref={wrapRef} style={{ position: "relative", height: canvasH, minWidth: "100%" }}>
          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", zIndex: 0 }}>
            {lines.map((l, i) => {
              const lit = selectedKind === l.from || selectedKind === l.to || dragging === l.from || dragging === l.to;
              const mx = (l.x1 + l.x2) / 2;
              const d = `M ${l.x1} ${l.y1} C ${mx} ${l.y1}, ${mx} ${l.y2}, ${l.x2} ${l.y2}`;
              return (
                <g key={i} style={{ opacity: (selectedKind || dragging) && !lit ? 0.25 : 1, transition: dragging ? "none" : "opacity .15s" }}>
                  <path d={d} fill="none" stroke={lit ? C.accent : "#D3C9B5"} strokeWidth={lit ? 1.8 : 1.2} strokeDasharray={l.dashed ? "5 4" : undefined} />
                  <circle cx={l.x2} cy={l.y2} r={2.5} fill={lit ? C.accent : "#D3C9B5"} />
                  {lit && (
                    <text x={mx} y={(l.y1 + l.y2) / 2 - 6} textAnchor="middle" className="dm-mono"
                      style={{ fontSize: 9.5, fill: C.accent, paintOrder: "stroke", stroke: "#F6F2E9", strokeWidth: 4 }}>
                      {l.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {kinds.map((def) => {
            const count = countByKind.get(def.kind) ?? 0;
            const ds = datasetForKind(def, tables);
            const selected = selectedKind === def.kind;
            const isDragged = dragging === def.kind;
            const empty = count === 0;
            const p = laidOut[def.kind];
            if (!p) return null;
            return (
              <div
                key={def.kind}
                ref={(el) => { if (el) cardRefs.current.set(def.kind, el); }}
                style={{
                  position: "absolute", left: p.x + 14, top: p.y + 14, width: CARD_W,
                  background: "#FFFDF8", borderRadius: 13, overflow: "hidden",
                  border: `1px solid ${selected || isDragged ? C.accent : "#E1D9C8"}`,
                  boxShadow: isDragged
                    ? "0 24px 50px -20px rgba(33,30,24,.4)"
                    : selected
                    ? "0 14px 34px -22px rgba(228,89,59,.4)"
                    : "0 10px 26px -22px rgba(33,30,24,.4)",
                  opacity: empty && !selected && !isDragged ? 0.78 : 1,
                  zIndex: isDragged ? 1000 : (zOrder[def.kind] ?? 0) + (selected ? 100 : 0) + 1,
                  transition: isDragged ? "none" : "border-color .15s, box-shadow .15s, opacity .15s",
                }}
              >
                {/* header = the table's name row; drag handle + click-to-browse */}
                <div
                  onPointerDown={onCardPointerDown(def.kind)}
                  onPointerMove={onCardPointerMove}
                  onPointerUp={onCardPointerUp(def.kind)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectKind(selected ? null : def.kind); } }}
                  title={`${def.plural ?? def.label} — drag to move · click to browse`}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: `color-mix(in srgb, ${def.color ?? "#A39B8B"} 10%, #FFFDF8)`, borderBottom: "1px solid #EFE9DC", padding: "8px 12px", cursor: isDragged ? "grabbing" : "grab", userSelect: "none", touchAction: "none", outline: "none" }}
                >
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2.5, background: def.color ?? "#A39B8B", flexShrink: 0 }} />
                  <span className="dm-display" style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{def.plural ?? def.label}</span>
                  <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "#8A8477", flexShrink: 0 }}>{count}</span>
                </div>

                {/* columns */}
                <div style={{ padding: "4px 0 3px" }}>
                  {def.fields.length === 0 && def.relations.length === 0 && (
                    <div className="dm-mono" style={{ fontSize: 10.5, color: "#B7AF9F", padding: "4px 12px 6px" }}>free-form — no template</div>
                  )}
                  {def.fields.map((f) => (
                    <div key={f.key} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 12px" }}>
                      <span className="dm-mono" style={{ fontSize: 11, color: "#514C43" }}>{f.key}</span>
                      {f.required && <span className="dm-mono" title="required" style={{ fontSize: 9, color: "#B08A2E" }}>*</span>}
                      <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: "#B7AF9F" }}>{f.type}</span>
                    </div>
                  ))}
                  {/* relations = foreign keys */}
                  {def.relations.map((r) => (
                    <div
                      key={r.predicate}
                      ref={(el) => { if (el) relRefs.current.set(`${def.kind}~${r.predicate}`, el); }}
                      style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 12px", background: "#FCF9F2" }}
                    >
                      <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{r.predicate}</span>
                      <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: "#8A8477" }}>
                        → {r.targetKind && known.has(r.targetKind) ? r.targetKind : "any"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* footer action: the materialized table, or make one */}
                <div style={{ borderTop: "1px solid #F1ECDF", padding: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  {ds ? (
                    <button type="button" onClick={() => onOpenTable?.(ds.id)} className="dm-mono"
                      style={{ fontSize: 10.5, color: C.ink, background: "#FBF8F1", border: "1px solid #E1D9C8", borderRadius: 7, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                      ▦ open table
                    </button>
                  ) : def.id ? (
                    <button type="button" onClick={() => materialize(def)} disabled={busyKind === def.kind} className="dm-mono"
                      title="Create an editable table from this category (its template becomes the columns)"
                      style={{ fontSize: 10.5, color: "#8A8477", background: "transparent", border: "1px dashed #DDD5C5", borderRadius: 7, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", opacity: busyKind === def.kind ? 0.6 : 1 }}>
                      {busyKind === def.kind ? "▦ building…" : "▦ make table"}
                    </button>
                  ) : null}
                  {selected && <span className="dm-mono" style={{ ...micro, marginLeft: "auto", color: C.accent }}>browsing ↓</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
