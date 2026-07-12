"use client";

/**
 * EXPORT AS FOLDERS — describe an organization ("by client, contracts apart
 * from invoices") and the model files your documents and notes into a folder
 * tree (it sees an inventory — names, kinds, links — never contents). The
 * resolved tree is previewed here; "Download .zip" builds the archive: true
 * documents keep their original file, everything else exports as markdown,
 * with a README describing the structure. Preview/confirm, on-demand only.
 */

import { useState } from "react";
import { C, Hov, ModalShell, fieldLabel, primaryBtn } from "./ui";
import type { FolderPlan } from "@/lib/datamodo/folder-export";

interface PreviewFile { path: string; label: string; mode: "original" | "markdown" }
interface Preview { plan: FolderPlan; files: PreviewFile[]; total: number }

const EXAMPLES = [
  "One folder per client, contracts separate from invoices",
  "By project, with a notes folder for concepts and ideas",
  "By month received, receipts and statements apart",
];

export function FolderExportModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<"preview" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async () => {
    if (!prompt.trim()) return;
    setPending("preview"); setError(null); setPreview(null);
    try {
      const res = await fetch("/api/knowledge/folder-export", {
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

  const download = async () => {
    if (!preview) return;
    setPending("download"); setError(null);
    try {
      const res = await fetch("/api/knowledge/folder-export", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: preview.plan, download: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(String((json as { error?: string }).error ?? "download failed"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${preview.plan.name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("network error — try again");
    } finally {
      setPending(null);
    }
  };

  // Group the flat file list into folders for the tree preview.
  const tree = preview
    ? [...preview.files.reduce((m, f) => {
        const folder = f.path.slice(0, f.path.lastIndexOf("/")) || "/";
        if (!m.has(folder)) m.set(folder, []);
        m.get(folder)!.push(f);
        return m;
      }, new Map<string, PreviewFile[]>()).entries()].sort((a, b) => a[0].localeCompare(b[0]))
    : [];

  return (
    <ModalShell
      title={<><span style={{ color: C.accent }}>▧</span> Export as folders</>}
      subtitle="A folder structure built from your graph — originals kept, notes as markdown"
      onClose={onClose}
      maxWidth={680}
      footer={
        <>
          <span className="dm-mono" style={{ fontSize: 11, color: error ? C.accent : "#A39B8B", minWidth: 0 }}>
            {error ?? (preview ? `${preview.total} file${preview.total === 1 ? "" : "s"} — nothing leaves until you download` : "The model sees names and links, never file contents")}
          </span>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            {preview && (
              <Hov onClick={pending ? undefined : runPreview} base={{ background: "#fff", color: "#57534A", border: "1px solid #E1D9C8", borderRadius: 11, padding: "11px 18px", fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer" }} hover={{ background: "#FBF8F1" }}>
                {pending === "preview" ? "Reorganizing…" : "Reorganize"}
              </Hov>
            )}
            <Hov
              onClick={pending || (!preview && !prompt.trim()) ? undefined : preview ? download : runPreview}
              base={{ ...primaryBtn(Boolean(pending) || (!preview && !prompt.trim())) }}
              hover={{ background: C.accentPress }}
            >
              {preview
                ? (pending === "download" ? "Building .zip…" : "↓ Download .zip")
                : (pending === "preview" ? "Organizing…" : "Preview structure")}
            </Hov>
          </div>
        </>
      }
    >
      <div className="dm-mono" style={{ ...fieldLabel }}>How should it be organized?</div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="e.g. one folder per client, contracts separate from invoices"
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
            <span className="dm-mono" style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{preview.plan.name}.zip</span>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>{tree.length} folder{tree.length === 1 ? "" : "s"} · {preview.total} files · + README.md</span>
          </div>
          <div style={{ border: "1px solid #ECE5D8", borderRadius: 11, background: "#fff", padding: "10px 14px", maxHeight: 340, overflowY: "auto" }}>
            {tree.map(([folder, files]) => (
              <div key={folder} style={{ marginBottom: 8 }}>
                <div className="dm-mono" style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>▧ {folder}/</div>
                <div style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2, marginTop: 3 }}>
                  {files.map((f) => (
                    <div key={f.path} style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span className="dm-mono" style={{ fontSize: 11.5, color: "#57534A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.path.slice(folder.length + 1)}
                      </span>
                      <span className="dm-mono" style={{ fontSize: 9.5, color: f.mode === "original" ? C.accent : "#A39B8B", flexShrink: 0 }}>
                        {f.mode === "original" ? "original" : "node → md"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 8, lineHeight: 1.5 }}>
            Anything the model didn&apos;t place lands in <span style={{ color: "#57534A" }}>unsorted/</span> — nothing is silently dropped. Your vault is untouched; this is a projection.
          </div>
        </div>
      )}
    </ModalShell>
  );
}
