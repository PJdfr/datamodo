"use client";

/**
 * KNOWLEDGE view — the canonical layer the whole product is built on: the
 * entities we've resolved (people, companies, invoices…) and the facts we know
 * about each, with provenance. Tables (the Data tab) are DERIVED projections of
 * this; this is the source of truth. Lazy-loaded from /api/knowledge/entities.
 */

import { useEffect, useMemo, useState } from "react";
import { C, monoLabel, CountUp, SourceRow } from "./ui";
import { ExplorerView } from "./explorer-view";
import { SchemaView, type SchemaTableRef } from "./schema-view";
import { EntityPageModal } from "./entity-page";
import { buildDatasetNodes, type DatasetNodeSource } from "@/lib/datamodo/node-shapes";
import { canSynthesize } from "@/lib/datamodo/synthesis";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

const KIND_TONE: Record<string, string> = {
  person: C.blue,
  people: C.blue,
  company: C.accent,
  org: C.accent,
  organization: C.accent,
  invoice: C.gold,
  project: C.green,
};
const toneOf = (kind: string) => KIND_TONE[kind.toLowerCase()] ?? C.ink;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const IRREGULAR_PLURAL: Record<string, string> = { person: "people", company: "companies", organization: "organizations" };
const plural = (kind: string) => {
  const key = kind.toLowerCase();
  if (IRREGULAR_PLURAL[key]) return IRREGULAR_PLURAL[key];
  if (/[^aeiou]y$/.test(kind)) return kind.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/.test(kind)) return kind + "es";
  return kind + "s";
};

function EntityCard({ e, kindDef, onOpen }: { e: KnowledgeEntityView; kindDef?: KindDef; onOpen?: (id: string) => void }) {
  const tone = kindDef?.color ?? toneOf(e.kind);
  const keys = Object.entries(e.naturalKeys ?? {});
  const [openFact, setOpenFact] = useState<number | null>(null);
  // Completeness against the category template: which REQUIRED fields are
  // still unknown for this entity?
  const missing = (kindDef?.fields ?? [])
    .filter((f) => f.required && !e.facts.some((fact) => fact.predicate === f.key))
    .map((f) => f.label);
  return (
    <div className="dm-card" style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 13, padding: "13px 15px" }}>
      <button
        type="button"
        onClick={onOpen ? () => onOpen(e.id) : undefined}
        title="Open this entity's page"
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: keys.length || e.facts.length || missing.length ? 10 : 0, width: "100%", background: "transparent", border: "none", padding: 0, cursor: onOpen ? "pointer" : "default", textAlign: "left", fontFamily: "inherit" }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 9, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{e.label.charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</div>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B" }}>{e.kind} · {e.edges} link{e.edges === 1 ? "" : "s"}{e.bodyMd ? " · 📝" : ""}</div>
        </div>
        {onOpen && <span className="dm-mono" style={{ fontSize: 10.5, color: "#B7AF9F", flexShrink: 0 }}>open ›</span>}
      </button>
      {(keys.length > 0 || missing.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: e.facts.length ? 10 : 0 }}>
          {keys.map(([k, v]) => (
            <span key={k} className="dm-mono" style={{ fontSize: 10.5, color: "#57534A", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 6, padding: "2px 7px" }}>{k.replace(/_/g, " ")}: {v}</span>
          ))}
          {missing.length > 0 && (
            <span className="dm-mono" title="Required by the category template but not captured yet" style={{ fontSize: 10.5, color: "#8A6D1F", background: "#FBF3DE", border: "1px solid #EFDDAE", borderRadius: 6, padding: "2px 7px" }}>
              missing: {missing.join(", ")}
            </span>
          )}
        </div>
      )}
      {e.facts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {e.facts.map((f, i) => {
            const hasProv = f.provenance.length > 0;
            const open = openFact === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={hasProv ? () => setOpenFact(open ? null : i) : undefined}
                  aria-expanded={hasProv ? open : undefined}
                  style={{ display: "grid", gridTemplateColumns: "minmax(84px,auto) 1fr auto", gap: 12, alignItems: "baseline", width: "100%", textAlign: "left", background: open ? "#FBF8F1" : "transparent", border: "none", borderRadius: 7, padding: "4px 6px", margin: "0 -6px", cursor: hasProv ? "pointer" : "default", fontFamily: "inherit", fontSize: 12.5, color: "inherit" }}
                >
                  <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", whiteSpace: "nowrap" }}>{f.predicate.replace(/_/g, " ")}</span>
                  <span style={{ color: f.ref ? C.accent : "#3A352C", fontWeight: f.ref ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis" }}>{f.ref ? `→ ${f.value}` : f.value}</span>
                  {hasProv && (
                    <span className="dm-mono" style={{ fontSize: 9.5, color: open ? C.accent : "#B7AF9F", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {f.sources} source{f.sources === 1 ? "" : "s"}
                      <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>›</span>
                    </span>
                  )}
                </button>
                {open && hasProv && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "5px 0 8px", paddingLeft: 6 }}>
                    {f.provenance.map((s, j) => <SourceRow key={j} s={s} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type KnowledgeViewName = "schema" | "explore";

export function KnowledgeView({ view, onSwitch, tables = [], onOpenTable, onTablesChanged }: {
  /** "schema" = the unified Tables surface (schema diagram + cards drill-down);
   *  "explore" = the graph walk. One flat toggle upstairs, nothing nested. */
  view: KnowledgeViewName;
  /** Flip the flat toggle to Explore ("◍ Explore" from a page modal). */
  onSwitch?: (v: "explore") => void;
  /** Materialized datasets — the schema view badges & opens them. */
  tables?: SchemaTableRef[];
  onOpenTable?: (datasetId: string) => void;
  /** A category was just materialized — parent refreshes its dataset list. */
  onTablesChanged?: () => void;
}) {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [datasetSources, setDatasetSources] = useState<DatasetNodeSource[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // Schema drill-down: the kind whose rows are browsed as cards below the diagram.
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  // Explorer wiring: entering via "◍ Explore" recenters on that entity; the
  // key remount resets the walk's breadcrumb trail.
  const [exploreId, setExploreId] = useState<string | null>(null);
  const [exploreSeed, setExploreSeed] = useState(0);
  const explore = (id: string) => {
    setExploreId(id);
    setExploreSeed((s) => s + 1);
    setOpenId(null);
    onSwitch?.("explore");
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Registry in parallel: it colors groups + powers completeness cues.
        const [res, kres] = await Promise.all([
          fetch("/api/knowledge/entities"),
          fetch("/api/kinds").catch(() => null),
        ]);
        const json = await res.json();
        if (alive) setEntities(json.entities ?? []);
        if (alive) setDatasetSources(json.datasets ?? []);
        if (alive && kres?.ok) setKinds((await kres.json()).kinds ?? []);
      } catch {
        /* leave empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const kindByName = useMemo(() => new Map(kinds.map((k) => [k.kind, k])), [kinds]);

  // Dataset-as-node: the Explorer's world is the entities PLUS each dataset as
  // a virtual node linked to the entities projected into its rows (pure
  // projection — node-shapes.ts; never enters the vault or the other views).
  const explorerEntities = useMemo(
    () => entities.concat(buildDatasetNodes(datasetSources, entities)),
    [entities, datasetSources],
  );

  const shown = useMemo(() => {
    const inKind = selectedKind ? entities.filter((e) => e.kind === selectedKind) : entities;
    const t = q.trim().toLowerCase();
    if (!t) return inKind;
    return inKind.filter((e) => `${e.label} ${e.kind} ${e.facts.map((f) => f.value).join(" ")}`.toLowerCase().includes(t));
  }, [entities, q, selectedKind]);

  const groups = useMemo(() => {
    const m = new Map<string, KnowledgeEntityView[]>();
    for (const e of shown) { if (!m.has(e.kind)) m.set(e.kind, []); m.get(e.kind)!.push(e); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown]);

  const totalFacts = useMemo(() => entities.reduce((n, e) => n + e.facts.length, 0), [entities]);
  const countByKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entities) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return m;
  }, [entities]);

  if (loading) return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Loading your knowledge…</div>;

  if (entities.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 26 }}>◍</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 8px" }}>No knowledge yet</h2>
        <p style={{ fontSize: 14.5, color: "#57534A", maxWidth: "44ch", margin: 0, lineHeight: 1.55 }}>As your agents read messages, the people, companies, and things they mention become entities here — the facts your tables are built from.</p>
      </div>
    );
  }

  // Full-bleed: the schema canvas and the walk want every pixel the
  // dashboard gives them (user call 2026-07-11) — no max-width cap.
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}><CountUp value={entities.length} /> thing{entities.length === 1 ? "" : "s"} we know about</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>{groups.length} kind{groups.length === 1 ? "" : "s"} · {totalFacts} fact{totalFacts === 1 ? "" : "s"} · your tables are built from these</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {view === "schema" && selectedKind && (
            <div style={{ position: "relative", minWidth: 220 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 12 }}>⌕</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entities & facts…" style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 9, padding: "7px 10px 7px 26px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
        </div>
      </div>


      {/* Explorer: stand on one node, walk edge to edge. Defaults to the
          best-connected entity until a walk begins. */}
      {view === "explore" && entities.length > 0 && (
        <ExplorerView
          key={exploreSeed}
          entities={explorerEntities}
          initialId={exploreId ?? entities[0].id}
          kindByName={kindByName}
          onOpenPage={setOpenId}
        />
      )}

      {view === "schema" && (
        <>
          <SchemaView
            kinds={kinds}
            countByKind={countByKind}
            tables={tables}
            selectedKind={selectedKind}
            onSelectKind={(k) => { setSelectedKind(k); setQ(""); }}
            onOpenTable={onOpenTable}
            onMaterialized={onTablesChanged}
          />
          {selectedKind && (() => {
            const def = kindByName.get(selectedKind);
            return (
              <div style={{ marginTop: 22 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: "0 2px 11px" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: def?.color ?? toneOf(selectedKind) }} />
                  <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: C.ink, margin: 0 }}>{def?.plural ?? titleCase(plural(selectedKind))}</h2>
                  <span className="dm-mono" style={{ ...monoLabel }}>{shown.length}</span>
                  <button type="button" onClick={() => setSelectedKind(null)} className="dm-mono"
                    style={{ marginLeft: "auto", fontSize: 10.5, color: "#8A8477", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    close ×
                  </button>
                </div>
                {shown.length === 0 && <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "8px 0 16px" }}>{q.trim() ? `Nothing matches “${q.trim()}”.` : "Nothing captured in this category yet."}</div>}
                <div className="dm-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {shown.map((e) => <EntityCard key={e.id} e={e} kindDef={def} onOpen={setOpenId} />)}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {openId && (() => {
        const ent = explorerEntities.find((e) => e.id === openId);
        if (!ent) return null;
        // ✦ Synthesize (on-demand only — north star): offered when the entity
        // has ≥2 connected bodies of content; the fresh note patches state so
        // the open page updates in place.
        const synthesize = canSynthesize(ent, entities)
          ? async () => {
              try {
                const res = await fetch(`/api/knowledge/entities/${ent.id}/synthesize`, { method: "POST" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) return String(json.error ?? "synthesis failed");
                setEntities((prev) => prev.map((e) => (e.id === ent.id ? { ...e, bodyMd: json.bodyMd ?? e.bodyMd } : e)));
                return null;
              } catch {
                return "network error — try again";
              }
            }
          : undefined;
        return (
          <EntityPageModal e={ent} kindDef={kindByName.get(ent.kind)} onClose={() => setOpenId(null)} onOpen={setOpenId} onExplore={explore} onSynthesize={synthesize} />
        );
      })()}
    </div>
  );
}
