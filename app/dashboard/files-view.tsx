"use client";

/**
 * FILES view — the documents that arrived as attachments, surfaced from the
 * knowledge graph. Every attachment becomes a `document` entity (the binary
 * stays in blob storage; its meaning lives here), and "folders" are
 * PROJECTIONS over its relationship facts — a folder is "every document
 * linked to Acme Inc", not a directory. One document can live in many
 * folders; folders assemble themselves as facts arrive; nothing is moved.
 * Lazy-loaded from /api/knowledge/entities like the Knowledge view.
 */

import { useEffect, useMemo, useState } from "react";
import { C, monoLabel, CountUp } from "./ui";
import { EntityPageModal } from "./entity-page";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

const DOCUMENT_KIND = "document";

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
  label: string;
  fileType: string | null;
  size: number | null;
  indexing: string | null;
  /** Entities this document is linked to (mentions/about/…) — its folders. */
  links: { id: string; label: string }[];
  /** The message it arrived on, from any fact's provenance. */
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
    label: e.label,
    fileType,
    size,
    indexing,
    links: [...links.entries()].map(([id, label]) => ({ id, label })),
    via,
  };
}

function DocCard({ d, onFolder, onOpen }: { d: DocView; onFolder: (id: string) => void; onOpen: (id: string) => void }) {
  const badge = d.indexing ? INDEX_BADGE[d.indexing] ?? null : null;
  const meta = [d.fileType ? shortType(d.fileType) : null, d.size != null ? fmtBytes(d.size) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="dm-card" style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 13, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={() => onOpen(d.id)} title="Open this document's page" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📄</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {meta && <span>{meta}</span>}
            {badge && <span style={{ background: badge.bg, color: badge.fg, borderRadius: 5, padding: "1px 6px", textTransform: "none", letterSpacing: 0 }}>{badge.label}</span>}
          </div>
        </div>
        </button>
        {/* The original binary never leaves blob storage — this streams it back. */}
        <a
          href={`/api/documents/${d.id}`}
          title="Download the original file"
          className="dm-mono"
          style={{ fontSize: 10.5, color: "#8A8477", border: "1px solid #ECE5D8", borderRadius: 7, padding: "4px 8px", textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" }}
        >original ↓</a>
      </div>
      {d.links.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {d.links.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onFolder(l.id)}
              title={`Show every document linked to ${l.label}`}
              className="dm-mono"
              style={{ fontSize: 10.5, color: C.accent, background: "#FDF6F2", border: "1px solid #F3D6CB", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}
            >
              → {l.label}
            </button>
          ))}
        </div>
      )}
      {d.via && (
        <div style={{ fontSize: 11.5, color: "#8A8477", marginTop: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          via {d.via.channel}{d.via.sender ? ` · ${d.via.sender}` : ""}{d.via.subject ? ` · “${d.via.subject}”` : ""}
        </div>
      )}
    </div>
  );
}

export function FilesView() {
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [kinds, setKinds] = useState<KindDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<string>("all");
  const [q, setQ] = useState("");
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
        if (alive && kres?.ok) setKinds((await kres.json()).kinds ?? []);
      } catch {
        /* leave empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const docs = useMemo(
    () => entities.filter((e) => e.kind === DOCUMENT_KIND).map(toDocView),
    [entities],
  );

  // Folders = every entity documents are linked to, counted. Pure projection.
  const folders = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const d of docs) {
      for (const l of d.links) {
        const cur = m.get(l.id);
        if (cur) cur.count++;
        else m.set(l.id, { label: l.label, count: 1 });
      }
    }
    return [...m.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [docs]);

  const shown = useMemo(() => {
    let list = folder === "all" ? docs : docs.filter((d) => d.links.some((l) => l.id === folder));
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((d) => `${d.label} ${d.fileType ?? ""} ${d.links.map((l) => l.label).join(" ")}`.toLowerCase().includes(t));
    return list;
  }, [docs, folder, q]);

  if (loading) return <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "40px 4px" }}>Loading your documents…</div>;

  if (docs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 20px" }}>
        <div className="dm-bob" style={{ width: 64, height: 64, borderRadius: 18, background: "#FBF8F1", border: "1px solid #ECE5D8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 26 }}>📄</div>
        <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 8px" }}>No documents yet</h2>
        <p style={{ fontSize: 14.5, color: "#57534A", maxWidth: "46ch", margin: 0, lineHeight: 1.55 }}>
          Forward a message with an attachment and it lands here: we keep the original file forever, read what it says, and link it to the people, companies and invoices it mentions — so it files itself into the right folders.
        </p>
      </div>
    );
  }

  const activeFolder = folder === "all" ? null : folders.find((f) => f.id === folder) ?? null;

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div className="dm-display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}><CountUp value={docs.length} /> document{docs.length === 1 ? "" : "s"}</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Originals kept forever · folders assemble themselves from what each document mentions</div>
        </div>
        <div style={{ marginLeft: "auto", position: "relative", minWidth: 220 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#B7AF9F", fontSize: 12 }}>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 9, padding: "7px 10px 7px 26px", fontFamily: "inherit", fontSize: 12.5, color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>

      {/* Smart folders: saved queries over relationship facts, not directories. */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
        <span className="dm-mono" style={{ ...monoLabel, marginRight: 2 }}>Folders</span>
        {[{ id: "all", label: "All documents", count: docs.length }, ...folders].map((f) => {
          const active = folder === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolder(f.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "#fff" : "#57534A", background: active ? C.accent : "#fff", border: `1px solid ${active ? C.accent : "#E1D9C8"}`, borderRadius: 999, padding: "5px 11px", cursor: "pointer", fontFamily: "inherit" }}
            >
              {f.id === "all" ? "🗂" : "📁"} {f.label}
              <span className="dm-mono" style={{ fontSize: 10, color: active ? "rgba(255,255,255,.8)" : "#A39B8B" }}>{f.count}</span>
            </button>
          );
        })}
      </div>

      {activeFolder && (
        <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginBottom: 12 }}>
          Every document linked to <span style={{ color: C.accent }}>{activeFolder.label}</span> — a live query over its facts, not a place files were moved to.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "20px 0" }}>Nothing matches{q.trim() ? ` “${q.trim()}”` : ""} in this folder.</div>
      ) : (
        <div className="dm-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {shown.map((d) => <DocCard key={d.id} d={d} onFolder={setFolder} onOpen={setOpenId} />)}
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
