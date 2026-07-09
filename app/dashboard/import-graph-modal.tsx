"use client";

/**
 * Import a spreadsheet as knowledge: upload an .xlsx, we infer a graph from it
 * (entities + relationships + facts) and merge it into the existing knowledge
 * layer via the same resolution/dedup path as message extraction.
 * See POST /api/knowledge/import-graph + lib/datamodo/infer-graph.ts.
 */

import { useRef, useState } from "react";
import { C, Hov, ModalShell, primaryBtn } from "./ui";

interface ImportResult {
  ok: true;
  schema: { entityKind: string; subjectLabel: string; references: { label: string }[]; attributes: { label: string }[] };
  rowsProcessed: number;
  entitiesCreated: number;
  entitiesResolved: number;
  factsNew: number;
  factsDeduped: number;
}

const plural = (k: string) => (/(s|x|z|ch|sh)$/.test(k) ? k + "es" : /[^aeiou]y$/.test(k) ? k.slice(0, -1) + "ies" : k + "s");

export function ImportGraphModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/knowledge/import-graph", { method: "POST", body: fd });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok || !data.ok) { setErr(data.error ?? "Import failed."); return; }
      setResult(data);
      onDone();
    } catch {
      setErr("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const stat = (n: number, label: string, tone: string) => (
    <div style={{ flex: "1 1 120px", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, padding: "12px 14px" }}>
      <div className="dm-display" style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", color: tone }}>{n}</div>
      <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B", marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <ModalShell title="Turn a spreadsheet into knowledge" subtitle="We read the table, infer the people/companies/things and how they connect, and fold it into your graph." onClose={onClose} badge={{ initial: "✦", bg: C.accent }}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
          {err && <span className="dm-mono" style={{ fontSize: 11.5, color: C.accent, marginRight: "auto" }}>{err}</span>}
          <Hov onClick={onClose} base={{ background: "none", border: "1px solid #DCD3C2", borderRadius: 10, padding: "9px 16px", fontFamily: "inherit", fontSize: 13.5, color: "#57534A", cursor: "pointer" }} hover={{ background: "#FBF8F1" }}>{result ? "Done" : "Cancel"}</Hov>
          {!result && (
            <Hov onClick={busy ? undefined : () => inputRef.current?.click()} base={{ ...primaryBtn(busy), padding: "9px 18px", fontSize: 13.5 }} hover={{ background: C.accentPress }}>{busy ? "Reading & merging…" : "Choose a spreadsheet"}</Hov>
          )}
        </div>
      }
    >
      <input ref={inputRef} type="file" accept=".xlsx" onChange={onFile} style={{ display: "none" }} />
      <div style={{ padding: "20px 22px" }}>
        {result ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: "#EAF4EC", border: "1px solid #CBE4D2", display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 14.5, color: C.ink }}>Merged <b>{result.rowsProcessed}</b> row{result.rowsProcessed === 1 ? "" : "s"} from {fileName ? <b>{fileName}</b> : "your sheet"} into your knowledge.</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {stat(result.entitiesCreated, "new entities", C.ink)}
              {stat(result.entitiesResolved, "matched existing", C.blue)}
              {stat(result.factsNew, "facts added", C.accent)}
              {stat(result.factsDeduped, "already known", "#A39B8B")}
            </div>
            <div style={{ background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 12, padding: "12px 14px", fontSize: 12.5, color: "#57534A", lineHeight: 1.6 }}>
              Read as <b style={{ color: C.ink }}>{plural(result.schema.entityKind)}</b> keyed on <b style={{ color: C.ink }}>{result.schema.subjectLabel}</b>.
              {result.schema.references.length > 0 && <> Linked to {result.schema.references.map((r) => r.label).join(", ")}.</>}
              {result.schema.attributes.length > 0 && <> Recorded {result.schema.attributes.map((a) => a.label).join(", ")}.</>}
            </div>
            <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>Anything the graph wasn&apos;t sure about lands in Review. Rows resolve against what you already know, so duplicates merge instead of piling up.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 12px", fontSize: 13, color: "#57534A", lineHeight: 1.5 }}>
              {[
                ["①", "Each row becomes an entity (a person, company, invoice…), inferred from the sheet's name."],
                ["②", "Columns that name other things become relationships; the rest become facts."],
                ["③", "Everything merges into your existing graph — matches dedupe, new things get added."],
              ].map(([n, t]) => (
                <div key={n} style={{ display: "contents" }}>
                  <span className="dm-mono" style={{ color: C.accent, fontSize: 13 }}>{n}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#FDF9F2", border: "1px solid #EFE1D2", borderRadius: 12, padding: "11px 14px", fontSize: 12.5, color: "#6B5f52", lineHeight: 1.5 }}>
              <b style={{ color: C.ink }}>Best done early.</b> Importing while your graph is small is cheap; merging a big table into a large graph means matching every row against everything you already know.
            </div>
            <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>Excel (.xlsx) — the first column is treated as each row&apos;s identity.</div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
