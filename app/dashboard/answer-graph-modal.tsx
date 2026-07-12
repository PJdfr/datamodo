"use client";

/**
 * ANSWER → GRAPH — "show your work". A grounded answer cites entities, rows
 * (via their subject entity) and passages (via their document); this modal
 * opens the Explorer walk with exactly those nodes highlighted: coral halo on
 * each cited node, lit edges between them, and a chip row to hop cite-to-cite.
 * Clicking a node or an edge behaves like the normal walk — side panel body,
 * edge inspector with the fact's evidence. Pure projection: same
 * /api/knowledge/entities world the Knowledge view loads, nothing stored.
 */

import { useEffect, useMemo, useState } from "react";
import { C, ModalShell } from "./ui";
import { ExplorerView } from "./explorer-view";
import { buildDatasetNodes, type DatasetNodeSource } from "@/lib/datamodo/node-shapes";
import { EntityPageModal } from "./entity-page";
import { buildNodeResolver } from "./markdown";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

export function AnswerGraphModal({ question, entityIds, onClose }: {
  /** The question the answer responded to — shown as the modal subtitle. */
  question: string;
  /** The entities the answer cited (in citation order). */
  entityIds: string[];
  onClose: () => void;
}) {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [datasetSources, setDatasetSources] = useState<DatasetNodeSource[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, kres] = await Promise.all([
          fetch("/api/knowledge/entities"),
          fetch("/api/kinds").catch(() => null),
        ]);
        const json = await res.json();
        if (alive) setEntities(json.entities ?? []);
        if (alive) setDatasetSources(json.datasets ?? []);
        if (alive && kres?.ok) setKinds((await kres.json()).kinds ?? []);
      } catch {
        /* leave empty — the modal shows the miss state */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const kindByName = useMemo(() => new Map(kinds.map((k) => [k.kind, k])), [kinds]);
  // Same world as the Knowledge view: entities + datasets as walkable nodes.
  const explorerEntities = useMemo(
    () => entities.concat(buildDatasetNodes(datasetSources, entities)),
    [entities, datasetSources],
  );
  const resolveNode = useMemo(() => buildNodeResolver(explorerEntities), [explorerEntities]);

  // Start standing on the best-connected cited node (most likely the hub the
  // rest of the citations ring around).
  const present = useMemo(() => {
    const byId = new Map(explorerEntities.map((e) => [e.id, e]));
    return entityIds.filter((id) => byId.has(id)).sort((a, b) => (byId.get(b)!.edges - byId.get(a)!.edges));
  }, [explorerEntities, entityIds]);

  return (
    <ModalShell
      title={<><span style={{ color: C.accent }}>◍</span> How this answer was grounded</>}
      subtitle={`“${question}” — the highlighted nodes and their connections are the sources the answer cited`}
      onClose={onClose}
      maxWidth={1160}
    >
      {loading && <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "40px 4px" }}>Loading your graph…</div>}
      {!loading && present.length === 0 && (
        <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "28px 4px" }}>
          The cited sources aren&apos;t in your knowledge graph (they may be table-only rows).
        </div>
      )}
      {!loading && present.length > 0 && (
        <ExplorerView
          entities={explorerEntities}
          initialId={present[0]}
          kindByName={kindByName}
          highlightIds={present}
          onOpenPage={setOpenId}
        />
      )}
      {openId && (() => {
        const ent = explorerEntities.find((e) => e.id === openId);
        return ent ? (
          <EntityPageModal
            e={ent}
            kindDef={kindByName.get(ent.kind)}
            onClose={() => setOpenId(null)}
            onOpen={setOpenId}
            resolveNode={resolveNode}
          />
        ) : null;
      })()}
    </ModalShell>
  );
}
