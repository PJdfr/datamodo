"use client";

/**
 * KNOWLEDGE view — the canonical layer the whole product is built on: the
 * entities we've resolved (people, companies, invoices…) and the facts we know
 * about each, with provenance. Tables (the Data tab) are DERIVED projections of
 * this; this is the source of truth. Lazy-loaded from /api/knowledge/entities.
 */

import { useEffect, useMemo, useState } from "react";
import { C, CountUp } from "./ui";
import { ExplorerView } from "./explorer-view";
import { GraphView } from "./graph-view";
import { SchemaView, datasetForKind, type SchemaTableLink, type SchemaTableRef } from "./schema-view";
import { EntityPageModal } from "./entity-page";
import { buildDatasetNodes, type DatasetNodeSource } from "@/lib/datamodo/node-shapes";
import { buildNodeResolver } from "./markdown";
import { canSynthesize } from "@/lib/datamodo/synthesis";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

// The per-kind EntityCard drill-down ("card wall") was REPLACED by the table
// page (Notion-grammar redesign 2026-07-20): clicking a kind on the schema
// canvas now opens its table — Cards live on as a view INSIDE the table
// surface, and per-row fact/provenance detail lives in its side peek.

export type KnowledgeViewName = "schema" | "explore" | "graph";

export function KnowledgeView({ view, onSwitch, tables = [], tableLinks = [], onOpenTable, onTablesChanged, exploreRequest }: {
  /** "schema" = the unified Tables surface (schema diagram; click a kind to
   *  open its table page); "explore" = the ego graph walk; "graph" = the whole
   *  vault at once (sigma.js canvas). One flat toggle upstairs, nothing nested. */
  view: KnowledgeViewName;
  /** Flip the flat toggle to Explore ("◍ Explore" from a page modal). */
  onSwitch?: (v: "explore") => void;
  /** Materialized datasets — the schema view badges & opens them. */
  tables?: SchemaTableRef[];
  /** Explicit table↔table links (dataset_relations) — dashed schema lines. */
  tableLinks?: SchemaTableLink[];
  onOpenTable?: (datasetId: string) => void;
  /** A category was just materialized — parent refreshes its dataset list. */
  onTablesChanged?: () => void;
  /** External walk hand-off (the table page's "◍ Walk"): each new seed
   *  recenters the Explorer on the given entity. */
  exploreRequest?: { id: string; seed: number } | null;
}) {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [datasetSources, setDatasetSources] = useState<DatasetNodeSource[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
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
  // Adjust-during-render (not an effect): each new hand-off seed recenters
  // the walk exactly once.
  const [seenSeed, setSeenSeed] = useState(0);
  if (exploreRequest && exploreRequest.seed !== seenSeed) {
    setSeenSeed(exploreRequest.seed);
    setExploreId(exploreRequest.id);
    setExploreSeed((s) => s + 1);
    setOpenId(null);
  }

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

  // Body [[wikilinks]] resolve against everything the surface knows about.
  const resolveNode = useMemo(() => buildNodeResolver(explorerEntities), [explorerEntities]);

  const totalFacts = useMemo(() => entities.reduce((n, e) => n + e.facts.length, 0), [entities]);
  const kindCount = useMemo(() => new Set(entities.map((e) => e.kind)).size, [entities]);
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
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>{kindCount} kind{kindCount === 1 ? "" : "s"} · {totalFacts} fact{totalFacts === 1 ? "" : "s"} · your tables are built from these</div>
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

      {/* Graph: the whole vault at once — no center, pick a layout; "walk
          from here" hands the node to the Explorer. */}
      {view === "graph" && entities.length > 0 && (
        <GraphView
          entities={explorerEntities}
          kindByName={kindByName}
          onOpenPage={setOpenId}
          onExplore={explore}
        />
      )}

      {view === "schema" && (
        <SchemaView
          kinds={kinds}
          countByKind={countByKind}
          tables={tables}
          tableLinks={tableLinks}
          onOpenKind={(def) => {
            // One object: the kind IS its table — open the table page.
            const ds = datasetForKind(def, tables);
            if (ds) onOpenTable?.(ds.id);
            else if (def.id) onOpenTable?.(def.id);
          }}
          onOpenTable={onOpenTable}
          onMaterialized={onTablesChanged}
        />
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
          <EntityPageModal e={ent} kindDef={kindByName.get(ent.kind)} onClose={() => setOpenId(null)} onOpen={setOpenId} onExplore={explore} onSynthesize={synthesize} resolveNode={resolveNode} />
        );
      })()}
    </div>
  );
}
