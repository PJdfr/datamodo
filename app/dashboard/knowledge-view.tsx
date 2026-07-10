"use client";

/**
 * KNOWLEDGE view — the canonical layer the whole product is built on: the
 * entities we've resolved (people, companies, invoices…) and the facts we know
 * about each, with provenance. Tables (the Data tab) are DERIVED projections of
 * this; this is the source of truth. Lazy-loaded from /api/knowledge/entities.
 */

import { useEffect, useMemo, useState } from "react";
import { C, monoLabel, CountUp, Segmented } from "./ui";
import { KnowledgeGraphView } from "./knowledge-graph";
import type { KnowledgeEntityView, FactSourceView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

const CHANNEL_META: Record<string, { emoji: string; label: string }> = {
  email: { emoji: "✉", label: "Email" },
  whatsapp: { emoji: "🟢", label: "WhatsApp" },
  slack: { emoji: "▦", label: "Slack" },
  teams: { emoji: "◇", label: "Teams" },
};
const channelMeta = (c: string) => CHANNEL_META[c] ?? { emoji: "•", label: c };

/** One source message behind a fact — the "where did this come from?" evidence. */
function SourceRow({ s }: { s: FactSourceView }) {
  const ch = channelMeta(s.channel);
  return (
    <div style={{ background: "#FCFAF4", border: "1px solid #EDE7DA", borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: s.snippet || s.preview ? 5 : 0, minWidth: 0 }}>
        <span style={{ fontSize: 11 }}>{ch.emoji}</span>
        <span className="dm-mono" style={{ fontSize: 9.5, color: "#8A8477", flexShrink: 0 }}>{ch.label}</span>
        {s.sender && <span style={{ fontSize: 11.5, color: C.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sender}</span>}
        {s.subject && <span style={{ fontSize: 11, color: "#8A8477", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {s.subject}</span>}
      </div>
      {s.snippet ? (
        <div style={{ fontSize: 12, color: "#57534A", lineHeight: 1.45 }}>“<span style={{ fontStyle: "italic" }}>{s.snippet}</span>”</div>
      ) : s.preview ? (
        <div style={{ fontSize: 12, color: "#8A8477", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis" }}>{s.preview}</div>
      ) : null}
    </div>
  );
}

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

function EntityCard({ e, kindDef }: { e: KnowledgeEntityView; kindDef?: KindDef }) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: keys.length || e.facts.length || missing.length ? 10 : 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{e.label.charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</div>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B" }}>{e.kind} · {e.edges} link{e.edges === 1 ? "" : "s"}</div>
        </div>
      </div>
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

export function KnowledgeView() {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"cards" | "graph">("cards");

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

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entities;
    return entities.filter((e) => `${e.label} ${e.kind} ${e.facts.map((f) => f.value).join(" ")}`.toLowerCase().includes(t));
  }, [entities, q]);

  const groups = useMemo(() => {
    const m = new Map<string, KnowledgeEntityView[]>();
    for (const e of shown) { if (!m.has(e.kind)) m.set(e.kind, []); m.get(e.kind)!.push(e); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown]);

  const totalFacts = useMemo(() => entities.reduce((n, e) => n + e.facts.length, 0), [entities]);

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

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}><CountUp value={entities.length} /> thing{entities.length === 1 ? "" : "s"} we know about</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>{groups.length} kind{groups.length === 1 ? "" : "s"} · {totalFacts} fact{totalFacts === 1 ? "" : "s"} · your tables are built from these</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Segmented value={mode} onChange={setMode} options={[{ v: "cards", label: "Cards" }, { v: "graph", label: "Graph" }]} />
          <div style={{ position: "relative", minWidth: 220 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 12 }}>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entities & facts…" style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 9, padding: "7px 10px 7px 26px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
      </div>

      {shown.length === 0 && <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "20px 0" }}>Nothing matches “{q.trim()}”.</div>}

      {mode === "graph" && shown.length > 0 && <KnowledgeGraphView entities={shown} />}

      {mode === "cards" && groups.map(([kind, list]) => {
        const def = kindByName.get(kind);
        return (
          <div key={kind} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: "0 2px 11px" }}>
              {def?.icon ? <span style={{ fontSize: 13 }}>{def.icon}</span> : <span style={{ width: 9, height: 9, borderRadius: 3, background: def?.color ?? toneOf(kind) }} />}
              <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: C.ink, margin: 0 }}>{def?.plural ?? titleCase(plural(kind))}</h2>
              <span className="dm-mono" style={{ ...monoLabel }}>{list.length}</span>
            </div>
            <div className="dm-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {list.map((e) => <EntityCard key={e.id} e={e} kindDef={def} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
