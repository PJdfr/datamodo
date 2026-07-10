"use client";

/**
 * ENTITY PAGE — a node opened in its NATURAL SHAPE, instead of a metadata card:
 * - a THICK node (a document with a generated summary body) reads as a page:
 *   markdown body first, then its concept/mention links and file meta;
 * - a THIN node (person, company, invoice…) reads as a RECORD: its category
 *   template's fields as a small table (missing required fields flagged), then
 *   any off-template facts, then its relationships as clickable chips.
 * Pure projection — everything shown is derived from the entity's facts.
 */

import { Fragment, type ReactNode } from "react";
import { C, ModalShell } from "./ui";
import type { KnowledgeEntityView, KnowledgeFactView } from "@/lib/datamodo/types";
import type { KindDef } from "@/lib/datamodo/ontology";

// --- Markdown-lite ------------------------------------------------------------
// A deliberately tiny renderer for the summaries WE generate (headings, bold,
// italic, inline code, links, lists). Everything renders as React text nodes,
// so arbitrary model output can never inject markup.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Tokenize: `code`, **bold**, *italic*, [text](http(s) url)
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) {
      out.push(<code key={key} className="dm-mono" style={{ fontSize: "0.92em", background: "#F3EFE6", borderRadius: 4, padding: "0 4px" }}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else {
      const label = tok.slice(1, tok.indexOf("]"));
      out.push(<a key={key} href={m[5]} target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownLite({ md }: { md: string }) {
  const blocks: ReactNode[] = [];
  const lines = md.split(/\r?\n/);
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={key++} style={{ margin: "6px 0", paddingLeft: 22, display: "grid", gap: 3 }}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `li${key}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };
  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={key++} style={{ margin: "6px 0" }}>{inline(para.join(" "), `p${key}`)}</p>);
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const h = /^(#{1,4})\s+(.*)/.exec(line);
    const li = /^[-*]\s+(.*)/.exec(line);
    const ol = /^\d+[.)]\s+(.*)/.exec(line);
    if (!line) { flushPara(); flushList(); continue; }
    if (h) {
      flushPara(); flushList();
      blocks.push(
        <div key={key++} className="dm-display" style={{ fontWeight: 700, fontSize: h[1].length <= 2 ? 14.5 : 13, letterSpacing: "-0.01em", color: C.ink, margin: "10px 0 2px" }}>
          {inline(h[2], `h${key}`)}
        </div>,
      );
    } else if (li || ol) {
      flushPara();
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((li ?? ol)![1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#3A352C" }}>{blocks}</div>;
}

// --- The page -------------------------------------------------------------------

const FALLBACK_TONE: Record<string, string> = { person: C.blue, company: C.accent, invoice: C.gold, document: C.green };
const DOC_META_PREDICATES = new Set(["file_type", "file_size", "indexed"]);

function RecordRow({ label, value, missing, refChip, onOpen, sources }: {
  label: string; value: ReactNode; missing?: boolean; refChip?: { id: string; label: string }[]; onOpen?: (id: string) => void; sources?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr auto", gap: 12, alignItems: "baseline", padding: "6px 8px", borderBottom: "1px solid #F1ECDF" }}>
      <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {missing ? (
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A6D1F", background: "#FBF3DE", border: "1px solid #EFDDAE", borderRadius: 6, padding: "1px 7px", justifySelf: "start" }}>missing</span>
      ) : refChip ? (
        <span style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {refChip.map((r) => (
            <button key={r.id} type="button" onClick={onOpen ? () => onOpen(r.id) : undefined} className="dm-mono"
              style={{ fontSize: 11, color: C.accent, background: "#FDF6F2", border: "1px solid #F3D6CB", borderRadius: 6, padding: "2px 8px", cursor: onOpen ? "pointer" : "default", fontFamily: "inherit" }}>
              → {r.label}
            </button>
          ))}
        </span>
      ) : (
        <span style={{ fontSize: 13, color: "#3A352C", overflowWrap: "anywhere" }}>{value}</span>
      )}
      {sources ? <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", whiteSpace: "nowrap" }}>{sources} source{sources === 1 ? "" : "s"}</span> : <span />}
    </div>
  );
}

export function EntityPageModal({ e, kindDef, onClose, onOpen }: {
  e: KnowledgeEntityView;
  kindDef?: KindDef;
  onClose: () => void;
  /** Navigate to another entity's page (relationship chips). */
  onOpen?: (id: string) => void;
}) {
  const tone = kindDef?.color ?? FALLBACK_TONE[e.kind] ?? C.ink;
  const isDoc = e.kind === "document";

  const attrs = e.facts.filter((f) => !f.ref);
  const rels = e.facts.filter((f) => f.ref && f.refId);
  const byPredicate = new Map<string, KnowledgeFactView[]>();
  for (const f of e.facts) {
    if (!byPredicate.has(f.predicate)) byPredicate.set(f.predicate, []);
    byPredicate.get(f.predicate)!.push(f);
  }

  // The record table: template fields first (in template order, missing
  // required flagged), then whatever off-template attributes exist.
  const fieldKeys = new Set((kindDef?.fields ?? []).map((f) => f.key));
  const templateRows = (kindDef?.fields ?? [])
    .filter((f) => !isDoc || !DOC_META_PREDICATES.has(f.key))
    .map((f) => ({ field: f, facts: (byPredicate.get(f.key) ?? []).filter((x) => !x.ref) }))
    .filter((r) => r.facts.length > 0 || r.field.required);
  const extraAttrs = attrs.filter((f) => !fieldKeys.has(f.predicate) && (!isDoc || !DOC_META_PREDICATES.has(f.predicate)));

  // Relationships grouped by verb; concepts surfaced separately for documents.
  const relGroups = new Map<string, { id: string; label: string }[]>();
  for (const f of rels) {
    if (!relGroups.has(f.predicate)) relGroups.set(f.predicate, []);
    relGroups.get(f.predicate)!.push({ id: f.refId!, label: f.value });
  }

  const docMeta = isDoc
    ? [byPredicate.get("file_type")?.[0]?.value, byPredicate.get("file_size")?.[0]?.value ? `${byPredicate.get("file_size")![0].value} bytes` : null, byPredicate.get("indexed")?.[0]?.value]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <ModalShell
      title={e.label}
      subtitle={`${kindDef?.label ?? e.kind} · ${e.edges} link${e.edges === 1 ? "" : "s"}${docMeta ? ` · ${docMeta}` : ""}`}
      onClose={onClose}
      maxWidth={640}
      badge={{ initial: kindDef?.icon ?? e.label.charAt(0).toUpperCase(), bg: tone }}
      footer={
        <>
          <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>
            {isDoc ? "The original file never leaves storage — this page is what we understood from it." : "The dossier is this page as cited markdown — every claim with its source."}
          </span>
          <span style={{ display: "inline-flex", gap: 8, whiteSpace: "nowrap" }}>
            <a href={`/api/knowledge/entities/${e.id}/dossier`} title="Download everything we know about this, cited" className="dm-mono" style={{ fontSize: 11, color: C.ink, border: "1px solid #DDD5C5", background: "#fff", borderRadius: 8, padding: "6px 12px", textDecoration: "none" }}>dossier ↓</a>
            {isDoc && <a href={`/api/documents/${e.id}`} className="dm-mono" style={{ fontSize: 11, color: C.ink, border: "1px solid #DDD5C5", background: "#fff", borderRadius: 8, padding: "6px 12px", textDecoration: "none" }}>original ↓</a>}
          </span>
        </>
      }
    >
      {/* Thick node: the generated body reads first, like a note. */}
      {e.bodyMd && (
        <div style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 6 }}>{e.kind === "note" ? "Note" : "Summary"}</div>
          <MarkdownLite md={e.bodyMd} />
        </div>
      )}

      {Object.keys(e.naturalKeys ?? {}).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {Object.entries(e.naturalKeys).map(([k, v]) => (
            <span key={k} className="dm-mono" style={{ fontSize: 10.5, color: "#57534A", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 6, padding: "2px 7px" }}>{k.replace(/_/g, " ")}: {v}</span>
          ))}
        </div>
      )}

      {/* Thin node: the record table — table-shaped knowledge renders as a table,
          never as a star of attribute edges. */}
      {(templateRows.length > 0 || extraAttrs.length > 0) && (
        <div style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", padding: "9px 8px 3px" }}>
            {kindDef ? `${kindDef.label} record` : "Facts"}
          </div>
          {templateRows.map(({ field, facts }) => (
            <Fragment key={field.key}>
              {facts.length === 0 ? (
                <RecordRow label={field.label} value={null} missing />
              ) : (
                <RecordRow
                  label={field.label}
                  value={facts.map((f) => f.value).join(" · ")}
                  sources={facts.reduce((n, f) => n + f.sources, 0)}
                />
              )}
            </Fragment>
          ))}
          {extraAttrs.map((f, i) => (
            <RecordRow key={`x${i}`} label={f.predicate.replace(/_/g, " ")} value={f.value} sources={f.sources} />
          ))}
        </div>
      )}

      {relGroups.size > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, padding: "9px 8px 12px", marginBottom: 4 }}>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 2 }}>Connections</div>
          {[...relGroups.entries()].map(([pred, targets]) => (
            <RecordRow key={pred} label={pred.replace(/_/g, " ")} value={null} refChip={targets} onOpen={onOpen} />
          ))}
        </div>
      )}

      {!e.bodyMd && templateRows.length === 0 && extraAttrs.length === 0 && relGroups.size === 0 && (
        <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "18px 4px" }}>Nothing captured about this yet.</div>
      )}
    </ModalShell>
  );
}
