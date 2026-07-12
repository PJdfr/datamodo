"use client";

/**
 * FOLDERS FROM YOUR GRAPH — describe an organization ("by client, contracts
 * apart from invoices") and the model files your documents and notes into a
 * folder tree (it sees an inventory — names, kinds, links — never contents).
 * The tree renders HERE as an explorable structure: nested subfolders
 * collapse/expand, clicking a file opens that node's page (body, facts,
 * provenance, original download). Downloading a .zip is optional — true
 * documents keep their original file, everything else exports as markdown,
 * plus a README describing the structure. Preview/confirm, on-demand only.
 */

import { useEffect, useMemo, useState } from "react";
import { C, Hov, ModalShell, fieldLabel, primaryBtn } from "./ui";
import { EntityPageModal } from "./entity-page";
import { buildNodeResolver } from "./markdown";
import type { FolderPlan } from "@/lib/datamodo/folder-export";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

interface PreviewFile { path: string; label: string; mode: "original" | "markdown"; entityId: string }
interface Preview { plan: FolderPlan; files: PreviewFile[]; total: number }

/* One node of the explorable tree: subfolders first, then files. */
interface TreeFolder {
  name: string;
  path: string;
  folders: TreeFolder[];
  files: PreviewFile[];
}

function buildTree(files: PreviewFile[]): TreeFolder {
  const root: TreeFolder = { name: "", path: "", folders: [], files: [] };
  for (const f of files) {
    const segs = f.path.split("/");
    segs.pop(); // the filename — folders are everything before it
    let cur = root;
    let path = "";
    for (const seg of segs) {
      path = path ? `${path}/${seg}` : seg;
      let next = cur.folders.find((x) => x.name === seg);
      if (!next) {
        next = { name: seg, path, folders: [], files: [] };
        cur.folders.push(next);
      }
      cur = next;
    }
    cur.files.push(f);
  }
  const sortRec = (t: TreeFolder) => {
    t.folders.sort((a, b) => a.name.localeCompare(b.name));
    t.files.sort((a, b) => a.path.localeCompare(b.path));
    t.folders.forEach(sortRec);
  };
  sortRec(root);
  return root;
}

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function FolderRow({ folder, depth, openPaths, toggle, onOpenFile }: {
  folder: TreeFolder;
  depth: number;
  openPaths: Set<string>;
  toggle: (path: string) => void;
  onOpenFile: (f: PreviewFile) => void;
}) {
  const open = openPaths.has(folder.path);
  return (
    <div>
      <button
        type="button"
        onClick={() => toggle(folder.path)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "4px 6px", paddingLeft: 6 + depth * 16, cursor: "pointer", fontFamily: "inherit", borderRadius: 7 }}
      >
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s", color: "#A39B8B", fontSize: 11, width: 10, flexShrink: 0 }}>›</span>
        <span style={{ color: C.accent, fontSize: 11, flexShrink: 0 }}>▧</span>
        <span className="dm-mono" style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{folder.name}/</span>
        <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>
          {folder.files.length > 0 && `${folder.files.length} file${folder.files.length === 1 ? "" : "s"}`}
          {folder.files.length > 0 && folder.folders.length > 0 && " · "}
          {folder.folders.length > 0 && `${folder.folders.length} folder${folder.folders.length === 1 ? "" : "s"}`}
        </span>
      </button>
      {open && (
        <div>
          {folder.folders.map((sub) => (
            <FolderRow key={sub.path} folder={sub} depth={depth + 1} openPaths={openPaths} toggle={toggle} onOpenFile={onOpenFile} />
          ))}
          {folder.files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => onOpenFile(f)}
              title={`Open ${f.label}`}
              style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "3px 6px", paddingLeft: 6 + (depth + 1) * 16 + 10, cursor: "pointer", fontFamily: "inherit", borderRadius: 7, minWidth: 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FBF8F1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span style={{ fontSize: 11.5, flexShrink: 0 }}>{f.mode === "original" ? "📄" : "▤"}</span>
              <span className="dm-mono" style={{ fontSize: 11.5, color: "#3A352C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName(f.path)}</span>
              <span className="dm-mono" style={{ fontSize: 9.5, color: f.mode === "original" ? C.accent : "#A39B8B", flexShrink: 0 }}>
                {f.mode === "original" ? "original" : "node → md"}
              </span>
              <span className="dm-mono" style={{ marginLeft: "auto", fontSize: 9.5, color: "#B7AF9F", flexShrink: 0 }}>open ›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  // Which folders are expanded (all of them, on a fresh preview).
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  // Click a file → its node page (body, facts, provenance, original ↓).
  const [openId, setOpenId] = useState<string | null>(null);
  // The world behind the files — loaded once so file clicks open instantly.
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);

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
        if (alive && kres?.ok) setKinds((await kres.json()).kinds ?? []);
      } catch { /* file clicks just won't resolve; the tree still shows */ }
    })();
    return () => { alive = false; };
  }, []);

  const kindByName = useMemo(() => new Map(kinds.map((k) => [k.kind, k])), [kinds]);
  const resolveNode = useMemo(() => buildNodeResolver(entities), [entities]);
  const tree = useMemo(() => (preview ? buildTree(preview.files) : null), [preview]);
  const folderCount = useMemo(() => {
    let n = 0;
    const walk = (t: TreeFolder) => { n += t.folders.length; t.folders.forEach(walk); };
    if (tree) walk(tree);
    return n;
  }, [tree]);

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
      const p = json as Preview;
      setPreview(p);
      // Start fully expanded — the structure IS the deliverable.
      const all = new Set<string>();
      for (const f of p.files) {
        const segs = f.path.split("/"); segs.pop();
        let path = "";
        for (const s of segs) { path = path ? `${path}/${s}` : s; all.add(path); }
      }
      setOpenPaths(all);
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

  const toggle = (path: string) =>
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <ModalShell
      title={<><span style={{ color: C.accent }}>▧</span> Folders from your graph</>}
      subtitle="Describe an organization — explore the tree here, open any file, download a .zip if you want it"
      onClose={onClose}
      maxWidth={680}
      footer={
        <>
          <span className="dm-mono" style={{ fontSize: 11, color: error ? C.accent : "#A39B8B", minWidth: 0 }}>
            {error ?? (preview ? `${folderCount} folder${folderCount === 1 ? "" : "s"} · ${preview.total} file${preview.total === 1 ? "" : "s"} — click any file to open it` : "The model sees names and links, never file contents")}
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
                : (pending === "preview" ? "Organizing…" : "Build structure")}
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

      {preview && tree && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
            <span className="dm-mono" style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>▧ {preview.plan.name}/</span>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>a live projection of your graph — explore it here, nothing was moved</span>
          </div>
          <div style={{ border: "1px solid #ECE5D8", borderRadius: 11, background: "#fff", padding: "8px 8px", maxHeight: 380, overflowY: "auto" }}>
            {tree.folders.map((f) => (
              <FolderRow key={f.path} folder={f} depth={0} openPaths={openPaths} toggle={toggle} onOpenFile={(file) => setOpenId(file.entityId)} />
            ))}
            {tree.files.map((f) => (
              <button key={f.path} type="button" onClick={() => setOpenId(f.entityId)}
                style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "3px 16px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 11.5 }}>{f.mode === "original" ? "📄" : "▤"}</span>
                <span className="dm-mono" style={{ fontSize: 11.5, color: "#3A352C" }}>{fileName(f.path)}</span>
              </button>
            ))}
          </div>
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 8, lineHeight: 1.5 }}>
            Anything the model didn&apos;t place lands in <span style={{ color: "#57534A" }}>unsorted/</span> — nothing is silently dropped. The .zip mirrors exactly this tree (originals kept; other nodes as markdown; + README).
          </div>
        </div>
      )}

      {openId && (() => {
        const ent = entities.find((e) => e.id === openId);
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
