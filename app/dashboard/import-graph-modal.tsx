"use client";

/**
 * Import a spreadsheet as knowledge — with a PREVIEW step: upload an .xlsx and
 * we show how we'd read it (each row's kind, which column is the identity,
 * which columns become links vs facts) WITHOUT writing anything. The user can
 * correct the reading (change the kind, pick another identity column, flip a
 * column between link/fact/skip, retarget what a link points at), then confirm
 * to merge. See POST /api/knowledge/import-graph (mode=preview + overrides)
 * + lib/datamodo/infer-graph-core.ts.
 */

import { useRef, useState } from "react";
import { C, Hov, ModalShell, primaryBtn } from "./ui";

type Role = "subject" | "reference" | "attribute" | "skip";

interface PreviewColumn { key: string; label: string; type: string; role: Role; refKind: string | null }
interface Preview {
  schema: { entityKind: string; subjectColumn: string; subjectLabel: string };
  rowCount: number;
  factCount: number;
  subjectSamples: string[];
  knownReferenced: number;
  newReferenced: number;
  columns: PreviewColumn[];
}
interface ImportResult {
  ok: true;
  schema: { entityKind: string; subjectLabel: string; references: { label: string }[]; attributes: { label: string }[] };
  rowsProcessed: number;
  entitiesCreated: number;
  entitiesResolved: number;
  factsNew: number;
  factsDeduped: number;
}

interface Overrides {
  entityKind?: string;
  subjectColumn?: string;
  columns?: Record<string, { role: "reference" | "attribute" | "skip"; kind?: string }>;
}

const ROLE_LABEL: Record<Role, string> = { subject: "identity", reference: "→ link", attribute: "fact", skip: "skip" };
const ROLE_TONE: Record<Role, { color: string; bg: string; border: string }> = {
  subject: { color: "#8A6D1F", bg: "#FBF3DE", border: "#EFDDAE" },
  reference: { color: C.accent, bg: "#FDF6F2", border: "#F3D6CB" },
  attribute: { color: "#57534A", bg: "#FBF8F1", border: "#ECE5D8" },
  skip: { color: "#A39B8B", bg: "transparent", border: "#DDD5C5" },
};

export function ImportGraphModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  const post = async (mode: "preview" | "import", f: File, ov: Overrides) => {
    const fd = new FormData();
    fd.append("file", f);
    if (mode === "preview") fd.append("mode", "preview");
    if (Object.keys(ov).length) fd.append("overrides", JSON.stringify(ov));
    const res = await fetch("/api/knowledge/import-graph", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(String(data.error ?? "Import failed."));
    return data;
  };

  const runPreview = async (f: File, ov: Overrides) => {
    setBusy(true);
    setErr(null);
    try {
      setPreview((await post("preview", f, ov)).preview as Preview);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    setOverrides({});
    setResult(null);
    await runPreview(f, {});
  };

  // Every correction re-runs the DRY preview so the numbers stay honest.
  const patch = (p: Partial<Overrides>) => {
    if (!file) return;
    const next = { ...overrides, ...p };
    setOverrides(next);
    void runPreview(file, next);
  };
  const patchColumn = (key: string, v: { role: "reference" | "attribute" | "skip"; kind?: string }) =>
    patch({ columns: { ...(overrides.columns ?? {}), [key]: v } });

  const confirm = async () => {
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    try {
      setResult((await post("import", file, overrides)) as ImportResult);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
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

  const cycleRole = (c: PreviewColumn) => {
    // reference → attribute → skip → reference (identity is changed via the select).
    const next = c.role === "reference" ? "attribute" : c.role === "attribute" ? "skip" : "reference";
    patchColumn(c.key, { role: next, ...(next === "reference" && c.refKind ? { kind: c.refKind } : {}) });
  };

  return (
    <ModalShell title="Turn a spreadsheet into knowledge" subtitle="We read the table, show you HOW we'd read it, and only merge once you confirm." onClose={onClose} badge={{ initial: "✦", bg: C.accent }} maxWidth={620}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
          {err && <span className="dm-mono" style={{ fontSize: 11.5, color: C.accent, marginRight: "auto" }}>{err}</span>}
          <Hov onClick={onClose} base={{ background: "none", border: "1px solid #DCD3C2", borderRadius: 10, padding: "9px 16px", fontFamily: "inherit", fontSize: 13.5, color: "#57534A", cursor: "pointer" }} hover={{ background: "#FBF8F1" }}>{result ? "Done" : "Cancel"}</Hov>
          {!result && !preview && (
            <Hov onClick={busy ? undefined : () => inputRef.current?.click()} base={{ ...primaryBtn(busy), padding: "9px 18px", fontSize: 13.5 }} hover={{ background: C.accentPress }}>{busy ? "Reading…" : "Choose a spreadsheet"}</Hov>
          )}
          {!result && preview && (
            <Hov onClick={busy ? undefined : confirm} base={{ ...primaryBtn(busy), padding: "9px 18px", fontSize: 13.5 }} hover={{ background: C.accentPress }}>{busy ? "Working…" : `Merge ${preview.rowCount} row${preview.rowCount === 1 ? "" : "s"}`}</Hov>
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
              <span style={{ fontSize: 14.5, color: C.ink }}>Merged <b>{result.rowsProcessed}</b> row{result.rowsProcessed === 1 ? "" : "s"} from {file ? <b>{file.name}</b> : "your sheet"} into your knowledge.</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {stat(result.entitiesCreated, "new entities", C.ink)}
              {stat(result.entitiesResolved, "matched existing", C.blue)}
              {stat(result.factsNew, "facts added", C.accent)}
              {stat(result.factsDeduped, "already known", "#A39B8B")}
            </div>
            <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>Anything the graph wasn&apos;t sure about lands in Review. Rows resolve against what you already know, so duplicates merge instead of piling up.</div>
          </div>
        ) : preview ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: busy ? 0.6 : 1, transition: "opacity .15s" }}>
            {/* The reading, in one editable sentence. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13.5, color: "#57534A" }}>
              <span><b style={{ color: C.ink }}>{preview.rowCount}</b> row{preview.rowCount === 1 ? "" : "s"}, each read as a</span>
              <input
                value={overrides.entityKind ?? preview.schema.entityKind}
                onChange={(e) => setOverrides((o) => ({ ...o, entityKind: e.target.value }))}
                onBlur={(e) => patch({ entityKind: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") patch({ entityKind: (e.target as HTMLInputElement).value }); }}
                title="What each row IS — its category"
                className="dm-mono"
                style={{ width: 110, border: "1px solid #DDD5C5", borderRadius: 8, padding: "4px 8px", fontFamily: "inherit", fontSize: 12, color: C.ink, background: "#fff", outline: "none" }}
              />
              <span>keyed on</span>
              <select
                value={preview.schema.subjectColumn}
                onChange={(e) => patch({ subjectColumn: e.target.value })}
                title="Which column is each row's identity"
                className="dm-mono"
                style={{ border: "1px solid #DDD5C5", borderRadius: 8, padding: "4px 8px", fontFamily: "inherit", fontSize: 12, color: C.ink, background: "#fff", outline: "none" }}
              >
                {preview.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>

            {/* Per-column roles — click a chip to cycle link → fact → skip. */}
            <div style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, overflow: "hidden" }}>
              {preview.columns.map((c) => {
                const tone = ROLE_TONE[c.role];
                return (
                  <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderBottom: "1px solid #F1ECDF", opacity: c.role === "skip" ? 0.55 : 1 }}>
                    <span style={{ fontSize: 12.5, color: C.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: c.role === "skip" ? "line-through" : "none" }}>{c.label}</span>
                    <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F" }}>{c.type}</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {c.role === "reference" && (
                        <input
                          value={(overrides.columns?.[c.key]?.kind ?? c.refKind) ?? ""}
                          onChange={(e) => setOverrides((o) => ({ ...o, columns: { ...(o.columns ?? {}), [c.key]: { role: "reference", kind: e.target.value } } }))}
                          onBlur={(e) => patchColumn(c.key, { role: "reference", kind: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") patchColumn(c.key, { role: "reference", kind: (e.target as HTMLInputElement).value }); }}
                          title="What this link points at"
                          className="dm-mono"
                          style={{ width: 80, border: "1px solid #F3D6CB", borderRadius: 7, padding: "2px 7px", fontFamily: "inherit", fontSize: 10.5, color: C.accent, background: "#FDF6F2", outline: "none" }}
                        />
                      )}
                      {c.role === "subject" ? (
                        <span className="dm-mono" style={{ fontSize: 10, color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 7, padding: "2px 9px" }}>{ROLE_LABEL[c.role]}</span>
                      ) : (
                        <button type="button" onClick={() => cycleRole(c)} title="Click to change: link → fact → skip" className="dm-mono"
                          style={{ fontSize: 10, color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 7, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit" }}>
                          {ROLE_LABEL[c.role]}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {stat(preview.knownReferenced, "links to things you know", C.blue)}
              {stat(preview.newReferenced, "new things created", C.ink)}
              {stat(preview.factCount, "facts to record", C.accent)}
            </div>
            {preview.subjectSamples.length > 0 && (
              <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>
                e.g. {preview.subjectSamples.slice(0, 3).join(" · ")} — nothing is written until you merge. Repeated names dedupe before they touch the graph.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 12px", fontSize: 13, color: "#57534A", lineHeight: 1.5 }}>
              {[
                ["①", "Each row becomes an entity (a person, company, invoice…), inferred from the sheet's name."],
                ["②", "Columns that name other things become relationships; the rest become facts."],
                ["③", "You review the reading first — fix the kind, the identity column, any column's role — then confirm the merge."],
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
            <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>Excel (.xlsx) — nothing merges until you confirm the preview.</div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
