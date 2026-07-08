"use client";

import { useEffect, useState } from "react";
import { C, Hov, ModalShell, monoLabel, fieldInput, fieldLabel, primaryBtn, ghostBtn } from "./ui";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";

// Build a table by PROJECTING the knowledge layer: pick an entity kind + a target
// table, and each entity of that kind becomes a row (columns filled from facts
// whose predicate matches the column key). Rows are written directly (accepted) —
// tables are a projection, not a review. POST /api/knowledge/project.

export function BuildFromKnowledgeModal({
  datasets,
  onClose,
  onDone,
}: {
  datasets: { id: string; name: string; columns: { key: string; label: string }[] }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [kinds, setKinds] = useState<{ kind: string; count: number }[]>([]);
  const [kind, setKind] = useState<string>("");
  const [datasetId, setDatasetId] = useState<string>(datasets[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; unchanged: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/knowledge/entities");
        const json = await res.json();
        const ents: KnowledgeEntityView[] = json.entities ?? [];
        const m = new Map<string, number>();
        for (const e of ents) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
        const list = [...m.entries()].map(([k, count]) => ({ kind: k, count })).sort((a, b) => b.count - a.count);
        setKinds(list);
        if (list[0]) setKind(list[0].kind);
      } catch { /* leave empty */ }
    })();
  }, []);

  const dataset = datasets.find((d) => d.id === datasetId);

  const build = async () => {
    setPending(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/knowledge/project", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, datasetId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to build."); return; }
      setResult({ added: json.added ?? 0, updated: json.updated ?? 0, unchanged: json.unchanged ?? 0 });
      onDone();
    } catch (e) {
      setError((e as Error).message ?? "Failed to build.");
    } finally {
      setPending(false);
    }
  };

  return (
    <ModalShell
      title="Build a table from your knowledge"
      subtitle="Project entities into rows"
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <span className="dm-mono" style={{ fontSize: 11, color: error ? C.accent : "#A39B8B" }}>
            {error ?? (result ? `Added ${result.added} · updated ${result.updated} · unchanged ${result.unchanged}` : " ")}
          </span>
          <Hov onClick={pending || !kind || !datasetId ? undefined : build} base={{ ...primaryBtn(pending || !kind || !datasetId) }} hover={{ background: C.accentPress }}>
            {pending ? "Building…" : result ? "Build again" : "Build table"}
          </Hov>
        </>
      }
    >
      <div className="dm-mono" style={{ ...fieldLabel }}>Entity kind</div>
      {kinds.length === 0 ? (
        <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "6px 0 14px" }}>No knowledge yet — as agents read messages, entities appear to build from.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {kinds.map((k) => {
            const sel = k.kind === kind;
            return (
              <Hov key={k.kind} onClick={() => setKind(k.kind)}
                base={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit", background: sel ? "#FDF1EC" : "#fff", color: sel ? C.accent : "#57534A", border: sel ? `1.5px solid ${C.accent}` : "1px solid #E1D9C8" }}
                hover={sel ? {} : { background: "#FBF8F1" }}>
                {k.kind}<span className="dm-mono" style={{ fontSize: 10.5, color: sel ? C.accent : "#A39B8B" }}>{k.count}</span>
              </Hov>
            );
          })}
        </div>
      )}

      <div className="dm-mono" style={{ ...fieldLabel }}>Into table</div>
      {datasets.length === 0 ? (
        <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "6px 0" }}>Create a table first, then build into it.</div>
      ) : (
        <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} style={{ ...fieldInput, cursor: "pointer" }}>
          {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}

      {dataset && (
        <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 12, lineHeight: 1.55 }}>
          Columns fill from facts whose name matches the column key. This table’s columns:{" "}
          <span style={{ color: "#57534A" }}>{dataset.columns.map((c) => c.key).join(", ") || "—"}</span>. Rows are written straight in (tables are a projection of your accepted facts).
        </div>
      )}
    </ModalShell>
  );
}
