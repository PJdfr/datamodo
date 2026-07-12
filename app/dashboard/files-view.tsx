"use client";

/**
 * FILES view — the documents & notes that live in the graph, organized by
 * FOLDER LENSES: a folder is a TAG derived deterministically from facts (no
 * LLM), so there is no single "right" tree — the same corpus organizes BY
 * CLIENT, BY PROJECT, BY TOPIC, BY MONTH, BY TYPE, and lenses stack two
 * levels deep ("client / month"). A document linked to two clients appears
 * in BOTH folders: membership, not location; nothing is ever moved. The
 * on-screen tree exports 1:1 as a .zip (originals kept, notes as markdown).
 * Lazy-loaded from /api/knowledge/entities like the Knowledge view.
 */

import { useEffect, useMemo, useState } from "react";
import { C, monoLabel, CountUp } from "./ui";
import { EntityPageModal } from "./entity-page";
import {
  collectFiledDocs,
  availableLenses,
  buildLensTree,
  treeToPlacements,
  UNFILED,
  type LensFolder,
  type LensKey,
} from "@/lib/datamodo/folder-lenses";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

const fmtBytes = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const shortType = (ct: string): string => {
  const t = ct.toLowerCase();
  if (t.includes("pdf")) return "PDF";
  if (t.includes("csv")) return "CSV";
  if (t.includes("json")) return "JSON";
  if (t.includes("spreadsheet") || t.includes("excel")) return "Sheet";
  if (t.startsWith("text/")) return "Text";
  if (t.startsWith("image/")) return "Image";
  if (t.startsWith("audio/")) return "Audio";
  const sub = t.split("/")[1];
  return sub ? sub.split(";")[0].toUpperCase().slice(0, 8) : t;
};

const INDEX_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  full: { label: "indexed", bg: "#EDF5EC", fg: "#3E6B44" },
  partial: { label: "partially indexed", bg: "#FBF3DE", fg: "#8A6D1F" },
  metadata_only: { label: "not indexed yet", bg: "#F3EFE6", fg: "#8A8477" },
};

interface DocView {
  id: string;
  kind: string;
  label: string;
  hasOriginal: boolean;
  fileType: string | null;
  size: number | null;
  indexing: string | null;
  links: { id: string; label: string }[];
  via: { channel: string; sender: string | null; subject: string | null } | null;
}

function toDocView(e: KnowledgeEntityView): DocView {
  let fileType: string | null = null;
  let size: number | null = null;
  let indexing: string | null = null;
  const links = new Map<string, string>();
  let via: DocView["via"] = null;
  for (const f of e.facts) {
    if (f.ref && f.refId) links.set(f.refId, f.value);
    else if (f.predicate === "file_type") fileType = f.value;
    else if (f.predicate === "file_size") size = parseInt(f.value, 10) || null;
    else if (f.predicate === "indexed") indexing = f.value;
    if (!via && f.provenance.length > 0) {
      const s = f.provenance[0];
      via = { channel: s.channel, sender: s.sender, subject: s.subject };
    }
  }
  return {
    id: e.id,
    kind: e.kind,
    label: e.label,
    hasOriginal: /^doc:[^:]+:/.test(e.naturalKeys?.id ?? ""),
    fileType,
    size,
    indexing,
    links: [...links.entries()].map(([id, label]) => ({ id, label })),
    via,
  };
}

function DocCard({ d, onOpen }: { d: DocView; onOpen: (id: string) => void }) {
  const badge = d.indexing ? INDEX_BADGE[d.indexing] ?? null : null;
  const meta = [d.fileType ? shortType(d.fileType) : d.kind === "note" ? "Note" : null, d.size != null ? fmtBytes(d.size) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="dm-card" style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 13, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={() => onOpen(d.id)} title="Open this page" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{d.kind === "note" ? "▤" : "📄"}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="dm-display" style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
            <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              {meta && <span>{meta}</span>}
              {badge && <span style={{ background: badge.bg, color: badge.fg, borderRadius: 5, padding: "1px 6px", textTransform: "none", letterSpacing: 0 }}>{badge.label}</span>}
            </div>
          </div>
        </button>
        {/* The original binary never leaves blob storage — this streams it back. */}
        {d.hasOriginal && (
          <a
            href={`/api/documents/${d.id}`}
            title="Download the original file"
            className="dm-mono"
            style={{ fontSize: 10.5, color: "#8A8477", border: "1px solid #ECE5D8", borderRadius: 7, padding: "4px 8px", textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" }}
          >original ↓</a>
        )}
      </div>
      {d.via && (
        <div style={{ fontSize: 11.5, color: "#8A8477", marginTop: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          via {d.via.channel}{d.via.sender ? ` · ${d.via.sender}` : ""}{d.via.subject ? ` · “${d.via.subject}”` : ""}
        </div>
      )}
    </div>
  );
}

/* One folder row of the lens tree (recursive, collapsible). */
function TreeFolder({ folder, depth, selPath, openPaths, toggle, onSelect }: {
  folder: LensFolder;
  depth: number;
  selPath: string | null;
  openPaths: Set<string>;
  toggle: (p: string) => void;
  onSelect: (p: string | null) => void;
}) {
  const open = openPaths.has(folder.path);
  const selected = selPath === folder.path;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {folder.children.length > 0 ? (
          <button type="button" onClick={() => toggle(folder.path)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${folder.name}`}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#A39B8B", fontSize: 11, width: 16, padding: 0, marginLeft: depth * 14, transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>›</button>
        ) : (
          <span style={{ width: 16, marginLeft: depth * 14 }} />
        )}
        <button
          type="button"
          onClick={() => onSelect(selected ? null : folder.path)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? "#fff" : folder.name === UNFILED ? "#8A8477" : "#57534A", background: selected ? C.accent : "transparent", border: "none", borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontFamily: "inherit", minWidth: 0 }}
        >
          <span style={{ fontSize: 11 }}>▧</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170, fontStyle: folder.name === UNFILED ? "italic" : "normal" }}>{folder.name}</span>
          <span className="dm-mono" style={{ fontSize: 9.5, color: selected ? "rgba(255,255,255,.8)" : "#A39B8B" }}>{folder.total}</span>
        </button>
      </div>
      {open && folder.children.map((c) => (
        <TreeFolder key={c.path} folder={c} depth={depth + 1} selPath={selPath} openPaths={openPaths} toggle={toggle} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function FilesView() {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [lens, setLens] = useState<LensKey | null>(null);
  const [lens2, setLens2] = useState<LensKey | null>(null);
  const [selPath, setSelPath] = useState<string | null>(null);
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
      } catch {
        /* leave empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filed = useMemo(() => collectFiledDocs(entities), [entities]);
  const lenses = useMemo(() => availableLenses(filed), [filed]);
  // The active lens: the picked one, or the first that discriminates.
  const activeLens = lens ?? lenses[0]?.key ?? null;
  const tree = useMemo(
    () => (activeLens ? buildLensTree(filed, [activeLens, ...(lens2 && lens2 !== activeLens ? [lens2] : [])]) : []),
    [filed, activeLens, lens2],
  );

  // Which docs the selected folder holds (its subtree), else all.
  const docIdsInSel = useMemo(() => {
    if (!selPath) return null;
    const find = (fs: LensFolder[]): LensFolder | null => {
      for (const f of fs) {
        if (f.path === selPath) return f;
        const hit = find(f.children);
        if (hit) return hit;
      }
      return null;
    };
    const f = find(tree);
    if (!f) return null;
    const ids = new Set<string>();
    const walk = (x: LensFolder) => { x.docs.forEach((d) => ids.add(d.id)); x.children.forEach(walk); };
    walk(f);
    return ids;
  }, [selPath, tree]);

  const docs = useMemo(() => {
    const filedIds = new Set(filed.map((f) => f.id));
    return entities.filter((e) => filedIds.has(e.id)).map(toDocView);
  }, [entities, filed]);

  const shown = useMemo(() => {
    let list = docIdsInSel ? docs.filter((d) => docIdsInSel.has(d.id)) : docs;
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((d) => `${d.label} ${d.fileType ?? ""} ${d.links.map((l) => l.label).join(" ")}`.toLowerCase().includes(t));
    return list;
  }, [docs, docIdsInSel, q]);

  const exportTree = async () => {
    setExporting(true); setExportError(null);
    try {
      const placements = treeToPlacements(tree);
      const name = `datamodo-${activeLens ?? "files"}${lens2 && lens2 !== activeLens ? `-${lens2}` : ""}`;
      const res = await fetch("/api/knowledge/folder-export", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: { name, placements }, download: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setExportError(String((json as { error?: string }).error ?? "export failed"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("network error — try again");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Loading your documents…</div>;

  if (filed.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 20px" }}>
        <div className="dm-bob" style={{ width: 64, height: 64, borderRadius: 18, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 26 }}>📄</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 8px" }}>No documents yet</h2>
        <p style={{ fontSize: 14.5, color: "#57534A", maxWidth: "46ch", margin: 0, lineHeight: 1.55 }}>
          Forward a message with an attachment and it lands here: we keep the original file forever, read what it says, and link it to the people, companies and invoices it mentions — so it files itself into every folder it belongs to.
        </p>
      </div>
    );
  }

  const second = lenses.filter((l) => l.key !== activeLens);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}><CountUp value={filed.length} /> document{filed.length === 1 ? "" : "s"} &amp; notes</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Folders derive from the graph — same files, as many trees as you have lenses; nothing is ever moved</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: 200 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 12 }}>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 9, padding: "7px 10px 7px 26px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" }} />
          </div>
          <button type="button" onClick={exporting ? undefined : exportTree} title="Download exactly this tree as a .zip (originals kept; notes as markdown)"
            className="dm-mono" style={{ fontSize: 11, color: C.ink, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {exporting ? "Building…" : "↓ Export tree"}
          </button>
        </div>
      </div>
      {exportError && <div className="dm-mono" style={{ fontSize: 11, color: C.accent, marginBottom: 10 }}>{exportError}</div>}

      {/* LENSES — each chip is a different tree over the same documents. */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
        <span className="dm-mono" style={{ ...monoLabel, marginRight: 2 }}>Organize</span>
        {lenses.map((l) => {
          const active = l.key === activeLens;
          return (
            <button key={l.key} type="button" onClick={() => { setLens(l.key); if (lens2 === l.key) setLens2(null); setSelPath(null); setOpenPaths(new Set()); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "#fff" : "#57534A", background: active ? C.ink : "#fff", border: `1px solid ${active ? C.ink : "#E1D9C8"}`, borderRadius: 999, padding: "5px 11px", cursor: "pointer", fontFamily: "inherit" }}>
              {l.label}
              <span className="dm-mono" style={{ fontSize: 10, color: active ? "rgba(255,255,255,.75)" : "#A39B8B" }}>{l.folders}</span>
            </button>
          );
        })}
        {second.length > 0 && (
          <>
            <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", marginLeft: 6 }}>then</span>
            <select value={lens2 ?? ""} onChange={(e) => { setLens2((e.target.value || null) as LensKey | null); setSelPath(null); setOpenPaths(new Set()); }}
              className="dm-mono" style={{ fontSize: 11, color: "#57534A", background: "#fff", border: "1px solid #E1D9C8", borderRadius: 8, padding: "4px 8px", fontFamily: "inherit", cursor: "pointer" }}>
              <option value="">—</option>
              {second.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </>
        )}
      </div>

      {/* The tree of the active lens stack. */}
      <div style={{ border: "1px solid #ECE5D8", borderRadius: 12, background: "#fff", padding: "8px 10px", marginBottom: 16, maxHeight: 280, overflowY: "auto" }}>
        <button type="button" onClick={() => setSelPath(null)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: selPath === null ? 600 : 400, color: selPath === null ? "#fff" : "#57534A", background: selPath === null ? C.accent : "transparent", border: "none", borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontFamily: "inherit", marginBottom: 2 }}>
          🗂 All <span className="dm-mono" style={{ fontSize: 9.5, color: selPath === null ? "rgba(255,255,255,.8)" : "#A39B8B" }}>{filed.length}</span>
        </button>
        {tree.map((f) => (
          <TreeFolder key={f.path} folder={f} depth={0} selPath={selPath} openPaths={openPaths}
            toggle={(p) => setOpenPaths((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; })}
            onSelect={setSelPath} />
        ))}
      </div>

      {selPath && (
        <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginBottom: 12 }}>
          <span style={{ color: C.accent }}>▧ {selPath}</span> — a live projection over the graph; the same file can sit in several folders.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "20px 0" }}>Nothing matches{q.trim() ? ` “${q.trim()}”` : ""} in this folder.</div>
      ) : (
        <div className="dm-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {shown.map((d) => <DocCard key={d.id} d={d} onOpen={setOpenId} />)}
        </div>
      )}

      {openId && (() => {
        const ent = entities.find((e) => e.id === openId);
        return ent ? (
          <EntityPageModal
            e={ent}
            kindDef={kinds.find((k) => k.kind === ent.kind)}
            onClose={() => setOpenId(null)}
            onOpen={setOpenId}
          />
        ) : null;
      })()}
    </div>
  );
}
