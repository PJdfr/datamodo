"use client";

/**
 * DERIVE A TABLE FROM YOUR GRAPH — describe the table in plain language; the
 * model designs a spec over the graph's SCHEMA (kinds + predicates, never the
 * data); the rows are built deterministically out of your entities, facts and
 * relationships. Preview first — nothing is written until "Create table"
 * (same preview/confirm contract as the spreadsheet import).
 */

import { useState } from "react";
import { C, Hov, ModalShell, fieldLabel, primaryBtn } from "./ui";
import type { DatasetColumn } from "@/lib/datamodo/types";
import type { DeriveTableSpec } from "@/lib/datamodo/derive-table";

interface Preview {
  spec: DeriveTableSpec;
  columns: DatasetColumn[];
  rows: Record<string, unknown>[];
  total: number;
}

const EXAMPLES = [
  "Companies with their industry, who works there, and how many invoices they sent",
  "Every document and what it mentions",
  "People and which company they work for",
];

export function DeriveTableModal({ onClose, onCreated }: {
  onClose: () => void;
  /** A dataset was created — refresh and (optionally) open it. */
  onCreated: (datasetId: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<"preview" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async () => {
    if (!prompt.trim()) return;
    setPending("preview"); setError(null); setPreview(null);
    try {
      const res = await fetch("/api/knowledge/derive-table", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(String(json.error ?? "preview failed")); return; }
      setPreview(json as Preview);
    } catch {
      setError("network error — try again");
    } finally {
      setPending(null);
    }
  };

  const create = async () => {
    if (!preview) return;
    setPending("create"); setError(null);
    try {
      const res = await fetch("/api/knowledge/derive-table", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: preview.spec, confirm: true }),
      });
      const json = await res.json();
      if (!res.ok) { setError(String(json.error ?? "create failed")); return; }
      onCreated(String(json.datasetId));
      onClose();
    } catch {
      setError("network error — try again");
    } finally {
      setPending(null);
    }
  };

  const srcLabel = (c: DeriveTableSpec["columns"][number]) => {
    const s = c.source;
    if (s.from === "label") return "name";
    if (s.from === "kind") return "kind";
    if (s.from === "attr") return `fact · ${s.predicate.replace(/_/g, " ")}`;
    return `${s.agg === "count" ? "count of" : "linked via"} ${s.predicate.replace(/_/g, " ")}`;
  };

  return (
    <ModalShell
      title={<><span style={{ color: C.accent }}>✦</span> Derive a table from your graph</>}
      subtitle="Describe it — rows and columns are built out of your entities, facts and relationships"
      onClose={onClose}
      maxWidth={760}
      footer={
        <>
          <span className="dm-mono" style={{ fontSize: 11, color: error ? C.accent : "#A39B8B", minWidth: 0 }}>
            {error ?? (preview ? `${preview.total} row${preview.total === 1 ? "" : "s"} ready — nothing is saved until you create it` : "The model sees your graph's shape, never your data")}
          </span>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            {preview && (
              <Hov onClick={pending ? undefined : runPreview} base={{ background: "#fff", color: "#57534A", border: "1px solid #E1D9C8", borderRadius: 11, padding: "11px 18px", fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer" }} hover={{ background: "#FBF8F1" }}>
                {pending === "preview" ? "Redesigning…" : "Redesign"}
              </Hov>
            )}
            <Hov
              onClick={pending || (!preview && !prompt.trim()) ? undefined : preview ? create : runPreview}
              base={{ ...primaryBtn(Boolean(pending) || (!preview && !prompt.trim())) }}
              hover={{ background: C.accentPress }}
            >
              {preview
                ? (pending === "create" ? "Creating…" : `Create table · ${preview.total} rows`)
                : (pending === "preview" ? "Designing…" : "Preview")}
            </Hov>
          </div>
        </>
      }
    >
      <div className="dm-mono" style={{ ...fieldLabel }}>What table do you want?</div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="e.g. companies with their industry, who works there, and how many invoices they sent"
        style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 11, padding: "11px 13px", fontFamily: "inherit", fontSize: 13.5, color: C.ink, background: "#fff", outline: "none", resize: "vertical", boxSizing: "border-box" }}
      />
      {!preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => setPrompt(x)}
              style={{ textAlign: "left", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 9, padding: "8px 11px", fontFamily: "inherit", fontSize: 12.5, color: "#57534A", cursor: "pointer" }}>
              {x}
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap", marginBottom: 4 }}>
            <span className="dm-display" style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em", color: C.ink }}>{preview.spec.name}</span>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>rows = your {preview.spec.kind} entities · {preview.total} total</span>
          </div>
          {preview.spec.description && <div style={{ fontSize: 12.5, color: "#8A8477", marginBottom: 10 }}>{preview.spec.description}</div>}

          {/* Where each column comes from — the trust story, per column. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {preview.spec.columns.map((c) => (
              <span key={c.key} className="dm-mono" style={{ fontSize: 10, color: "#57534A", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 6, padding: "3px 8px" }}>
                {c.label} <span style={{ color: "#A39B8B" }}>← {srcLabel(c)}</span>
              </span>
            ))}
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ECE5D8", borderRadius: 11, background: "#fff" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {preview.columns.map((c) => (
                    <th key={c.key} className="dm-mono" style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B", fontWeight: 500, padding: "8px 11px", borderBottom: "1px solid #ECE5D8", whiteSpace: "nowrap" }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i}>
                    {preview.columns.map((c) => (
                      <td key={c.key} style={{ padding: "7px 11px", borderBottom: i === preview.rows.length - 1 ? "none" : "1px solid #F3EFE6", color: r[c.key] == null || r[c.key] === "" ? "#C9BCA6" : "#3A352C", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r[c.key] == null || r[c.key] === "" ? "—" : String(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > preview.rows.length && (
            <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 7 }}>Showing the first {preview.rows.length} of {preview.total} rows.</div>
          )}
        </div>
      )}
    </ModalShell>
  );
}
