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

import { useEffect, useMemo, useRef, useState } from "react";
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

// Each grouping dimension belongs to a family so the step picker reads the way
// the user thinks about it: "group by a relationship, a concept, or a tag".
const LENS_FAMILY: Record<LensKey, string> = {
  client: "Relationships", person: "Relationships", project: "Relationships",
  topic: "Concepts",
  type: "Attributes", month: "Attributes", channel: "Attributes",
};
const FAMILY_ORDER = ["Relationships", "Concepts", "Attributes"];
// The label without the leading "by " — used inside the pipeline chips.
const stepName = (label: string): string => label.replace(/^by /, "");

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

/* One folder row inside a Miller column. Selecting drills the next column
 * open; a › chevron marks folders that split further under the pipeline. */
function ColumnRow({ folder, selected, hasNext, onSelect }: {
  folder: LensFolder;
  selected: boolean;
  hasNext: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const isUnfiled = folder.name === UNFILED;
  return (
    <button
      type="button"
      onClick={onSelect}
      title={folder.name}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", minWidth: 0, fontSize: 12.5, fontWeight: selected ? 600 : 400, color: selected ? "#fff" : isUnfiled ? "#9A9384" : "#57534A", background: selected ? C.accent : hover ? "#F6F1E7" : "transparent", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background .12s" }}
    >
      <span style={{ fontSize: 11.5, flexShrink: 0, color: selected ? "rgba(255,255,255,.9)" : isUnfiled ? "#B7AF9F" : C.accent }}>▧</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: isUnfiled ? "italic" : "normal" }}>{folder.name}</span>
      <span className="dm-mono" style={{ fontSize: 9.5, flexShrink: 0, color: selected ? "rgba(255,255,255,.8)" : "#A39B8B" }}>{folder.total}</span>
      {hasNext && <span style={{ flexShrink: 0, fontSize: 11, color: selected ? "rgba(255,255,255,.7)" : "#C9BFAD" }}>›</span>}
    </button>
  );
}

/* A file row inside the trailing (contents) column. A mono type badge stands
 * in for the icon; clicking opens the entity page. */
function FileRow({ d, selected, onOpen }: { d: DocView; selected: boolean; onOpen: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const badge = d.fileType ? shortType(d.fileType).toUpperCase() : d.kind === "note" ? "NOTE" : "DOC";
  const meta = [d.fileType ? shortType(d.fileType) : d.kind === "note" ? "Note" : null, d.size != null ? fmtBytes(d.size) : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onOpen(d.id)}
      title={d.label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0, background: selected ? C.accent : hover ? "#F6F1E7" : "transparent", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background .12s" }}
    >
      <span className="dm-mono" style={{ flexShrink: 0, fontSize: 8, fontWeight: 600, letterSpacing: "0.03em", color: selected ? "#fff" : "#8A8477", background: selected ? "rgba(255,255,255,.18)" : "#F1EADC", border: `1px solid ${selected ? "transparent" : "#E4DCCB"}`, borderRadius: 5, padding: "3px 3px", minWidth: 28, textAlign: "center" }}>{badge}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: selected ? 600 : 500, color: selected ? "#fff" : "#3D3A33", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
        {meta && <span className="dm-mono" style={{ display: "block", fontSize: 9, color: selected ? "rgba(255,255,255,.8)" : "#A39B8B", marginTop: 1 }}>{meta}</span>}
      </span>
      {d.hasOriginal && <span className="dm-mono" style={{ flexShrink: 0, fontSize: 9, color: selected ? "rgba(255,255,255,.7)" : "#C9BFAD" }}>↓</span>}
    </button>
  );
}

export function FilesView() {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  // The user-built classification pipeline: an ORDERED list of dimensions, each
  // nesting inside the last. Any depth — add/remove/reorder steps freely.
  const [steps, setSteps] = useState<LensKey[]>([]);
  const seeded = useRef(false);
  // Which step's picker popover is open (or the "add a level" picker).
  const [picker, setPicker] = useState<{ index: number } | "add" | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pQuery, setPQuery] = useState("");
  const [selPath, setSelPath] = useState<string | null>(null);
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
  const lensLabel = useMemo(() => new Map(lenses.map((l) => [l.key, l.label])), [lenses]);
  // Seed a sensible first step once the corpus loads (the most discriminating
  // lens), but never fight the user afterwards — even if they clear it.
  useEffect(() => {
    if (seeded.current || loading || lenses.length === 0) return;
    setSteps([lenses[0].key]);
    seeded.current = true;
  }, [loading, lenses]);
  const tree = useMemo(() => buildLensTree(filed, steps), [filed, steps]);

  // Finder columns: walk the selected path down the tree. chain[i] is the
  // folder chosen at depth i (the highlighted item in column i).
  const chain = useMemo(() => {
    const crumbs = selPath ? selPath.split("/") : [];
    const out: LensFolder[] = [];
    let level = tree;
    for (const seg of crumbs) {
      const f = level.find((x) => x.name === seg);
      if (!f) break;
      out.push(f);
      level = f.children;
    }
    return out;
  }, [tree, selPath]);

  const docs = useMemo(() => {
    const filedIds = new Set(filed.map((f) => f.id));
    return entities.filter((e) => filedIds.has(e.id)).map(toDocView);
  }, [entities, filed]);
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  const exportTree = async () => {
    setExporting(true); setExportError(null);
    try {
      const placements = treeToPlacements(tree);
      const name = `datamodo-${steps.length ? steps.join("-") : "files"}`;
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
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#A39B8B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5M9 13h6M9 17h4" /></svg>
        </div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 8px" }}>No documents yet</h2>
        <p style={{ fontSize: 14.5, color: "#57534A", maxWidth: "46ch", margin: 0, lineHeight: 1.55 }}>
          Forward a message with an attachment and it lands here: we keep the original file forever, read what it says, and link it to the people, companies and invoices it mentions — so it files itself into every folder it belongs to.
        </p>
      </div>
    );
  }

  // Any pipeline edit invalidates the current selection/expansion.
  const resetNav = () => { setSelPath(null); setPicker(null); setPQuery(""); };
  const setStepAt = (index: number, key: LensKey) => { setSteps((s) => s.map((k, i) => (i === index ? key : k))); resetNav(); };
  // Appending a level keeps the outer folders identical, so we DON'T reset the
  // view — the new column's header (its split label) renders immediately with
  // an empty body until its parent is selected, so adding never feels like a
  // no-op. The current selection is preserved.
  const addStep = (key: LensKey) => { setSteps((s) => [...s, key]); setPicker(null); setPQuery(""); };
  const removeStep = (index: number) => { setSteps((s) => s.filter((_, i) => i !== index)); resetNav(); };
  const moveStep = (index: number, dir: -1 | 1) => {
    setSteps((s) => { const j = index + dir; if (j < 0 || j >= s.length) return s; const n = [...s]; [n[index], n[j]] = [n[j], n[index]]; return n; });
    resetNav();
  };
  // Options offered by a step's picker: available lenses not already used
  // elsewhere in the pipeline (a dimension used twice would nest into itself),
  // filtered by the search box and grouped by family.
  const pickerOptions = (forIndex: number | null) => {
    const taken = new Set(steps.filter((_, i) => i !== forIndex));
    const t = pQuery.trim().toLowerCase();
    return lenses.filter((l) => !taken.has(l.key) && (!t || l.label.toLowerCase().includes(t) || LENS_FAMILY[l.key].toLowerCase().includes(t)));
  };

  const ministep = { border: "none", background: "transparent", cursor: "pointer", color: "#8A8477", fontSize: 12, lineHeight: 1, padding: "6px 5px", fontFamily: "inherit" } as const;

  // Open the dimension picker anchored under the clicked column header (or the
  // "+ add" button). We capture the button's screen rect so the popover can be
  // FIXED-positioned — it must escape the horizontally-scrolling column strip,
  // which would otherwise clip it.
  const openPicker = (target: { index: number } | "add", el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPickerAnchor({ x: r.left, y: r.bottom + 6 });
    setPicker(target);
    setPQuery("");
  };
  const closePicker = () => { setPicker(null); setPQuery(""); };

  // The searchable dimension picker — rendered ONCE, fixed at the anchor,
  // outside the column scroller. Grouped Relationships / Concepts / Attributes.
  const renderPicker = () => {
    if (picker === null) return null;
    const forIndex = picker === "add" ? null : picker.index;
    const opts = pickerOptions(forIndex);
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const left = Math.max(8, Math.min(pickerAnchor?.x ?? 0, vw - 254));
    const top = pickerAnchor?.y ?? 0;
    return (
      <>
        <div onClick={closePicker} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div style={{ position: "fixed", left, top, zIndex: 41, width: 246, background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, boxShadow: "0 24px 50px -24px rgba(33,30,24,.5)", padding: 8, maxHeight: 330, overflowY: "auto" }}>
          <div style={{ position: "relative", marginBottom: 4 }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 12 }}>⌕</span>
            <input autoFocus value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder="Find a way to group…"
              style={{ width: "100%", border: "1px solid #E1D9C8", borderRadius: 8, padding: "6px 8px 6px 24px", fontFamily: "inherit", fontSize: 12, color: C.ink, background: "#FBF8F1", outline: "none", boxSizing: "border-box" }} />
          </div>
          {opts.length === 0 ? (
            <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", padding: "8px 6px" }}>Nothing left to group by.</div>
          ) : (
            FAMILY_ORDER.filter((fam) => opts.some((o) => LENS_FAMILY[o.key] === fam)).map((fam) => (
              <div key={fam} style={{ marginBottom: 2 }}>
                <div className="dm-mono" style={{ fontSize: 8.5, letterSpacing: "0.09em", textTransform: "uppercase", color: "#B7AF9F", padding: "6px 8px 3px" }}>{fam}</div>
                {opts.filter((o) => LENS_FAMILY[o.key] === fam).map((o) => (
                  <button key={o.key} type="button" onClick={() => (forIndex === null ? addStep(o.key) : setStepAt(forIndex, o.key))}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F6F1E7")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", fontSize: 12.5, color: "#3D3A33", background: "transparent", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background .12s" }}>
                    <span style={{ color: C.accent, fontSize: 11 }}>▧</span>
                    <span style={{ flex: 1, textTransform: "capitalize" }}>{stepName(o.label)}</span>
                    <span className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B" }}>{o.folders} folder{o.folders === 1 ? "" : "s"}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </>
    );
  };

  const selectPath = (p: string | null) => setSelPath(p);
  const crumbs = selPath ? selPath.split("/") : [];

  // The Finder columns to render, left → right. EVERY defined step gets a
  // column so its header (the split label) is always visible — even before its
  // parent is selected, when its body is empty (`folders: null`). When the
  // deepest selection is a LEAF (or there are no splits), a trailing FILES
  // column shows its documents.
  const folderCols: { depth: number; folders: LensFolder[] | null }[] = steps.map((_, depth) => ({
    depth,
    folders: depth === 0 ? tree : chain[depth - 1] ? chain[depth - 1].children : null,
  }));
  const deepest = chain[chain.length - 1];
  const filesCol: { docs: DocView[] } | null =
    steps.length === 0
      ? { docs }
      : deepest && deepest.children.length === 0
        ? { docs: deepest.docs.map((fd) => docById.get(fd.id)).filter((x): x is DocView => Boolean(x)) }
        : null;

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}><CountUp value={filed.length} /> document{filed.length === 1 ? "" : "s"} &amp; notes</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Build the tree yourself, step by step — folders derive from the graph, so nothing is ever moved and a file can sit in every folder it belongs to</div>
        </div>
        <button type="button" onClick={exporting ? undefined : exportTree} title="Download exactly this tree as a .zip (originals kept; notes as markdown)"
          className="dm-mono" style={{ marginLeft: "auto", fontSize: 11, color: C.ink, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          {exporting ? "Building…" : "↓ Export tree"}
        </button>
      </div>
      {exportError && <div className="dm-mono" style={{ fontSize: 11, color: C.accent, marginBottom: 10 }}>{exportError}</div>}

      {/* FINDER COLUMN VIEW — folders drill left → right into columns; the
          trailing column shows the FILES in the selected folder. The one way
          this differs from Finder: each folder column's HEADER is its split
          control — you decide how that level is classified (change the
          dimension / reorder / remove). "+" at the far right adds a deeper
          split. Nothing is ever moved — folders are projections of the graph. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
        <span className="dm-mono" style={{ ...monoLabel }}>Your files</span>
        <span style={{ fontSize: 11.5, color: "#A39B8B" }}>drill left → right; set each column’s split at its header · nothing is ever moved</span>
      </div>
      <div style={{ border: "1px solid #ECE5D8", borderRadius: 14, background: "#fff", boxShadow: "0 22px 46px -38px rgba(33,30,24,.5)", overflow: "hidden", marginBottom: 8 }}>
        <div style={{ display: "flex", height: 400, overflowX: "auto" }}>
          {folderCols.map(({ depth, folders }) => {
            const key = steps[depth];
            const editing = picker !== null && picker !== "add" && picker.index === depth;
            return (
              <div key={`col-${depth}-${key}`} style={{ width: 216, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #EFE9DC" }}>
                {/* header — the split control (this is the "folder path" you set) */}
                <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid #EFE9DC", background: editing ? "#FBEEE8" : "#FBF8F1" }}>
                  <button type="button" onClick={(e) => openPicker({ index: depth }, e.currentTarget)} title="Change how this level splits"
                    style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.ink, background: "transparent", border: "none", padding: "9px 8px", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
                    <span style={{ color: C.accent, fontSize: 11 }}>▧</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{stepName(lensLabel.get(key) ?? key)}</span>
                    <span style={{ color: "#B7AF9F", fontSize: 10 }}>⌄</span>
                  </button>
                  <span style={{ display: "inline-flex", alignItems: "center", paddingRight: 4 }}>
                    {depth > 0 && <button type="button" title="Move earlier" onClick={() => moveStep(depth, -1)} style={ministep}>‹</button>}
                    {depth < steps.length - 1 && <button type="button" title="Move later" onClick={() => moveStep(depth, 1)} style={ministep}>›</button>}
                    <button type="button" title="Remove this level" onClick={() => removeStep(depth)} style={{ ...ministep, color: "#B7AF9F" }}>×</button>
                  </span>
                </div>
                <div className="cc-scroll" style={{ flex: 1, overflowY: "auto", padding: 6 }}>
                  {folders === null ? (
                    <div className="dm-mono" style={{ fontSize: 10.5, color: "#C4BBA9", padding: "16px 8px", lineHeight: 1.5 }}>Pick a folder in the column to the left to fill this split.</div>
                  ) : folders.length === 0 ? (
                    <div className="dm-mono" style={{ fontSize: 10.5, color: "#C4BBA9", padding: "16px 8px" }}>Nothing splits further here.</div>
                  ) : (
                    folders.map((f) => {
                      const sel = crumbs[depth] === f.name;
                      return (
                        <ColumnRow key={f.path} folder={f} selected={sel} hasNext
                          onSelect={() => selectPath(sel ? (depth === 0 ? null : chain[depth - 1].path) : f.path)} />
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}

          {/* trailing content column — the FILES of the selected folder. Its
              header is reserved for the NEXT split (a "+" that turns these files
              into sub-folders); the folder's own name isn't repeated here — it's
              already selected & highlighted in the column to the left. */}
          {filesCol && (
            <div style={{ width: 250, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #EFE9DC" }}>
              <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #EFE9DC", background: "#FBF8F1", padding: "7px 8px", minHeight: 37 }}>
                {pickerOptions(null).length > 0 && (
                  <button type="button" title="Split these into sub-folders" aria-label="Add a level" onClick={(e) => openPicker("add", e.currentTarget)}
                    style={{ width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1, color: picker === "add" ? "#fff" : C.accent, background: picker === "add" ? C.accent : "transparent", border: `1px dashed ${picker === "add" ? C.accent : "#DAD0BE"}`, borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>+</button>
                )}
              </div>
              <div className="cc-scroll" style={{ flex: 1, overflowY: "auto", padding: 6 }}>
                {filesCol.docs.length === 0 ? (
                  <div className="dm-mono" style={{ fontSize: 10.5, color: "#C4BBA9", padding: "16px 8px" }}>No files here.</div>
                ) : (
                  filesCol.docs.map((d) => <FileRow key={d.id} d={d} selected={openId === d.id} onOpen={setOpenId} />)
                )}
              </div>
            </div>
          )}

          {/* "+" rail — add a level when there's no content column to host it */}
          {!filesCol && pickerOptions(null).length > 0 && (
            <div style={{ width: 42, flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 6 }}>
              <button type="button" title="Add a level" aria-label="Add a level" onClick={(e) => openPicker("add", e.currentTarget)}
                style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, lineHeight: 1, color: picker === "add" ? "#fff" : C.accent, background: picker === "add" ? C.accent : "transparent", border: `1px dashed ${picker === "add" ? C.accent : "#DAD0BE"}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                +
              </button>
            </div>
          )}
        </div>
      </div>

      {renderPicker()}

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
