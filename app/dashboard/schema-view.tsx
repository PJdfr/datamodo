"use client";

/**
 * SCHEMA VIEW — "how your tables connect", Supabase-style (IA decision
 * 2026-07-11: Tables, Cards and Concepts are ONE feature — a concept is just a
 * kind, a kind is just a table's shape, cards are just a way of displaying its
 * rows). Each category renders as a table card: its template fields as column
 * rows, its relations as foreign-key rows, and one SVG overlay draws the
 * relation lines between cards — read it like a database diagram.
 *
 * Actions per card: browse the rows (cards grid, handled by the parent) and
 * "▦ table" (open the materialized dataset, or create it via the idempotent
 * category→table endpoint).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "./ui";
import type { KindDef } from "@/lib/datamodo/ontology";

const micro = { fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase" as const, color: "#A39B8B" };

export interface SchemaTableRef {
  id: string;
  name: string;
}

/** The dataset a kind materializes into — same naming rule the
 *  category→table endpoint uses (plural, else label+"s"; case-insensitive). */
export function datasetForKind(def: KindDef, tables: SchemaTableRef[]): SchemaTableRef | null {
  const want = (def.plural?.trim() || `${def.label}s`).toLowerCase();
  return tables.find((t) => t.name.toLowerCase() === want) ?? null;
}

interface Line { x1: number; y1: number; x2: number; y2: number; label: string; from: string; to: string }

export function SchemaView({ kinds, countByKind, tables, selectedKind, onSelectKind, onOpenTable, onMaterialized }: {
  kinds: KindDef[];
  countByKind: Map<string, number>;
  tables: SchemaTableRef[];
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

  const known = useMemo(() => new Set(kinds.map((k) => k.kind)), [kinds]);

  // Relation lines: from each FK row's edge to the target card's edge —
  // measured from the live DOM (grid reflows with the viewport).
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
        const y2 = b.top + Math.min(18, b.height / 2) - wr.top;
        out.push({ x1, y1, x2, y2, label: r.predicate.replace(/_/g, " "), from: k.kind, to: r.targetKind });
      }
    }
    setLines(out);
  }, [kinds, known]);

  useEffect(() => {
    const raf = requestAnimationFrame(measure);
    const wrap = wrapRef.current;
    const ro = wrap ? new ResizeObserver(() => requestAnimationFrame(measure)) : null;
    if (wrap && ro) ro.observe(wrap);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [measure]);

  // ONE OBJECT (user decision 2026-07-11): creating a "table" and creating a
  // "concept/category" are the same act — a new kind is born WITH its
  // materialized dataset, in one click. The template starts minimal (a name
  // column); columns grow via the Categories editor or the table itself.
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

  // Structure-first ordering: populated kinds first (by count), then empty.
  const ordered = useMemo(
    () => [...kinds].sort((a, b) => (countByKind.get(b.kind) ?? 0) - (countByKind.get(a.kind) ?? 0) || a.label.localeCompare(b.label)),
    [kinds, countByKind],
  );

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {/* relation lines under the cards */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", zIndex: 0 }}>
        {lines.map((l, i) => {
          const lit = selectedKind === l.from || selectedKind === l.to;
          const mx = (l.x1 + l.x2) / 2;
          // Gentle elbow: out horizontally, then to the target — database-diagram reading.
          const d = `M ${l.x1} ${l.y1} C ${mx} ${l.y1}, ${mx} ${l.y2}, ${l.x2} ${l.y2}`;
          return (
            <g key={i} style={{ opacity: selectedKind && !lit ? 0.25 : 1, transition: "opacity .15s" }}>
              <path d={d} fill="none" stroke={lit ? C.accent : "#D8CFBD"} strokeWidth={lit ? 1.8 : 1.2} />
              <circle cx={l.x2} cy={l.y2} r={2.5} fill={lit ? C.accent : "#D8CFBD"} />
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))", gap: 18, position: "relative", zIndex: 1 }}>
        {ordered.map((def) => {
          const count = countByKind.get(def.kind) ?? 0;
          const ds = datasetForKind(def, tables);
          const selected = selectedKind === def.kind;
          const empty = count === 0;
          return (
            <div
              key={def.kind}
              ref={(el) => { if (el) cardRefs.current.set(def.kind, el); }}
              style={{
                background: "#FFFDF8", borderRadius: 13, overflow: "hidden",
                border: `1px solid ${selected ? C.accent : "#E7E0D2"}`,
                boxShadow: selected ? "0 14px 34px -22px rgba(228,89,59,.4)" : "0 12px 30px -26px rgba(33,30,24,.35)",
                opacity: empty && !selected ? 0.72 : 1,
                transition: "border-color .15s, box-shadow .15s, opacity .15s",
              }}
            >
              {/* header = the table's name row */}
              <button
                type="button"
                onClick={() => onSelectKind(selected ? null : def.kind)}
                title={empty ? "Nothing captured in this category yet" : `Browse the ${count} record${count === 1 ? "" : "s"}`}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: `color-mix(in srgb, ${def.color ?? "#A39B8B"} 9%, #FFFDF8)`, border: "none", borderBottom: "1px solid #EFE9DC", padding: "9px 12px", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2.5, background: def.color ?? "#A39B8B", flexShrink: 0 }} />
                <span className="dm-display" style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", color: C.ink }}>{def.plural ?? def.label}</span>
                <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "#8A8477" }}>{count}</span>
              </button>

              {/* columns */}
              <div style={{ padding: "5px 0 3px" }}>
                {def.fields.length === 0 && def.relations.length === 0 && (
                  <div className="dm-mono" style={{ fontSize: 10.5, color: "#B7AF9F", padding: "5px 12px 7px" }}>free-form — no template</div>
                )}
                {def.fields.map((f) => (
                  <div key={f.key} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3.5px 12px" }}>
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
                    style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3.5px 12px", background: "#FCF9F2" }}
                  >
                    <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{r.predicate}</span>
                    <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: "#8A8477" }}>
                      → {r.targetKind && known.has(r.targetKind) ? r.targetKind : "any"}
                    </span>
                  </div>
                ))}
              </div>

              {/* footer action: the materialized table, or make one */}
              <div style={{ borderTop: "1px solid #F1ECDF", padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
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

        {/* + New table — which IS a new category: one object, born together. */}
        <div style={{ border: "1.5px dashed #DDD5C5", borderRadius: 13, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, padding: "16px 14px", background: "rgba(255,253,248,.5)" }}>
          <div className="dm-mono" style={{ ...micro }}>+ new table</div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createKindTable(); }}
            placeholder="e.g. Suppliers…"
            style={{ border: "1px solid #DDD5C5", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, background: "#fff", outline: "none" }}
          />
          <button type="button" onClick={createKindTable} disabled={creating || !newName.trim()} className="dm-mono"
            style={{ fontSize: 10.5, color: newName.trim() ? "#fff" : "#A39B8B", background: newName.trim() ? C.accent : "#F1ECDF", border: "none", borderRadius: 8, padding: "6px 10px", cursor: creating || !newName.trim() ? "default" : "pointer", fontFamily: "inherit", opacity: creating ? 0.6 : 1 }}>
            {creating ? "creating…" : "create category + table"}
          </button>
          {createError && <span className="dm-mono" style={{ fontSize: 10, color: "#A0522D" }}>{createError}</span>}
          <span style={{ fontSize: 10.5, color: "#A39B8B", lineHeight: 1.45 }}>One object: the category (what the extractor files things under) and its editable table.</span>
        </div>
      </div>
    </div>
  );
}
