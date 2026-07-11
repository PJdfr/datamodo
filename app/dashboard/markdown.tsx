"use client";

/**
 * MARKDOWN BODY — the Obsidian-flavored renderer for node pages (bodies are
 * `entities.body_md`). Maps the pure parser's AST (lib/datamodo/markdown.ts)
 * to React elements — text never becomes HTML, so model- or user-authored
 * bodies can't inject markup. The only innerHTML on the page is KaTeX's own
 * MathML output, generated from the TeX source by KaTeX itself.
 *
 * Graph-aware: [[wikilinks]] resolve to real nodes (click = open that node,
 * exactly like a Connection chip); ![[embeds]] of image/audio documents render
 * the original media inline. Unresolved links stay quiet plain text, like
 * Obsidian's unresolved links.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { C } from "./ui";
import {
  parseMarkdown,
  safeLinkHref,
  safeMediaSrc,
  type MdBlock,
  type MdInline,
  type MdListItem,
} from "@/lib/datamodo/markdown";
import { entityAudioType, entityImageType } from "@/lib/datamodo/node-shapes";
import type { KnowledgeEntityView } from "@/lib/datamodo/types";

/** What a wikilink target resolves to — supplied by the surface that knows
 *  the org's nodes (knowledge view / explorer). */
export interface ResolvedNode {
  id: string;
  label: string;
  /** Set when the node's natural shape is media — embeds render it inline. */
  media?: "image" | "audio" | null;
}
export type ResolveNode = (target: string) => ResolvedNode | null;

/** Build a label-matching resolver over the org's nodes (case-insensitive;
 *  document labels are filenames, so ![[receipt.jpg]] finds the image node). */
export function buildNodeResolver(entities: KnowledgeEntityView[]): ResolveNode {
  const byLabel = new Map<string, KnowledgeEntityView>();
  for (const e of entities) {
    const key = e.label.trim().toLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, e);
  }
  return (target: string) => {
    const e = byLabel.get(target.trim().toLowerCase());
    if (!e) return null;
    return {
      id: e.id,
      label: e.label,
      media: entityImageType(e) ? "image" : entityAudioType(e) ? "audio" : null,
    };
  };
}

// --- KaTeX, lazily ----------------------------------------------------------------
// MathML output renders natively in every modern browser — no stylesheet, no
// fonts. The library only loads when a body actually contains math.

interface KatexModule { renderToString(tex: string, opts: Record<string, unknown>): string }
let katexPromise: Promise<KatexModule> | null = null;
const loadKatex = () => (katexPromise ??= import("katex").then((m) => (m as unknown as { default: KatexModule }).default ?? (m as unknown as KatexModule)));

function MathTex({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadKatex()
      .then((k) => {
        if (!alive) return;
        setHtml(k.renderToString(tex, { output: "mathml", displayMode: display, throwOnError: false }));
      })
      .catch(() => { /* fallback below stays */ });
    return () => { alive = false; };
  }, [tex, display]);
  if (html === null) {
    return <code className="dm-mono" style={{ fontSize: "0.92em", background: "#F3EFE6", borderRadius: 4, padding: "0 4px" }}>{tex}</code>;
  }
  // KaTeX's own MathML for the TeX above — not user HTML.
  return display
    ? <div style={{ textAlign: "center", margin: "10px 0", fontSize: 15 }} dangerouslySetInnerHTML={{ __html: html }} />
    : <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// --- inline rendering ---------------------------------------------------------------

function WikiLink({ node, alias, resolve, onOpen }: { node: MdInline & { t: "wikilink" }; alias: string | null; resolve?: ResolveNode; onOpen?: (id: string) => void }) {
  const hit = resolve?.(node.target) ?? null;
  const text = alias ?? node.target;
  if (!hit) {
    return (
      <span title="No node with this name (yet)" style={{ color: "#8A8477", borderBottom: "1px dashed #C9C1B2" }}>{text}</span>
    );
  }
  // Embedded media: the node IS the payload — render it, not a link.
  if (node.embed && hit.media === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob-backed, size unknown at build
      <img src={`/api/documents/${hit.id}?inline=1`} alt={hit.label} loading="lazy"
        style={{ display: "block", maxWidth: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 10, border: "1px solid #ECE5D8", background: "#FBF8F1", margin: "8px 0" }} />
    );
  }
  if (node.embed && hit.media === "audio") {
    return <audio controls preload="none" src={`/api/documents/${hit.id}?inline=1`} style={{ display: "block", width: "100%", margin: "8px 0" }} />;
  }
  return (
    <button type="button" onClick={onOpen ? () => onOpen(hit.id) : undefined} title={`Open ${hit.label}`} className="dm-mono"
      style={{ fontSize: "0.92em", color: C.accent, background: "#FDF6F2", border: "1px solid #F3D6CB", borderRadius: 6, padding: "0 6px", cursor: onOpen ? "pointer" : "default", fontFamily: "inherit" }}>
      {node.embed ? "▤ " : ""}{text}
    </button>
  );
}

function renderInlines(nodes: MdInline[], keyBase: string, resolve?: ResolveNode, onOpen?: (id: string) => void): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyBase}-${i}`;
    switch (n.t) {
      case "text": return <Fragment key={key}>{n.text}</Fragment>;
      case "strong": return <strong key={key}>{renderInlines(n.children, key, resolve, onOpen)}</strong>;
      case "em": return <em key={key}>{renderInlines(n.children, key, resolve, onOpen)}</em>;
      case "del": return <del key={key} style={{ color: "#8A8477" }}>{renderInlines(n.children, key, resolve, onOpen)}</del>;
      case "mark": return <mark key={key} style={{ background: "#FBF3DE", color: "inherit", borderRadius: 3, padding: "0 2px" }}>{renderInlines(n.children, key, resolve, onOpen)}</mark>;
      case "code": return <code key={key} className="dm-mono" style={{ fontSize: "0.92em", background: "#F3EFE6", borderRadius: 4, padding: "0 4px" }}>{n.text}</code>;
      case "link": {
        const href = safeLinkHref(n.href);
        const inner = renderInlines(n.children, key, resolve, onOpen);
        return href
          ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>{inner}</a>
          : <Fragment key={key}>{inner}</Fragment>;
      }
      case "image": {
        const src = safeMediaSrc(n.src);
        if (!src) return <Fragment key={key}>{n.alt}</Fragment>;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- author-provided source, size unknown at build
          <img key={key} src={src} alt={n.alt} loading="lazy"
            style={{ display: "block", maxWidth: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 10, border: "1px solid #ECE5D8", background: "#FBF8F1", margin: "8px 0" }} />
        );
      }
      case "wikilink": return <WikiLink key={key} node={n} alias={n.alias} resolve={resolve} onOpen={onOpen} />;
      case "math": return <MathTex key={key} tex={n.tex} display={false} />;
    }
  });
}

// --- block rendering ----------------------------------------------------------------

function TaskBox({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 13, height: 13, borderRadius: 4, marginRight: 7, flexShrink: 0, fontSize: 9.5, lineHeight: 1, border: `1px solid ${checked ? C.green : "#C9C1B2"}`, background: checked ? "#EAF4EC" : "#fff", color: C.green, transform: "translateY(1.5px)" }}>
      {checked ? "✓" : ""}
    </span>
  );
}

function ListBlock({ block, keyBase, resolve, onOpen }: { block: MdBlock & { t: "list" }; keyBase: string; resolve?: ResolveNode; onOpen?: (id: string) => void }) {
  const Tag = block.ordered ? "ol" : "ul";
  const isTasks = block.items.some((it) => it.checked !== null);
  return (
    <Tag style={{ margin: "6px 0", paddingLeft: isTasks ? 4 : 22, display: "grid", gap: 3, listStyle: isTasks ? "none" : undefined }}>
      {block.items.map((it: MdListItem, i) => (
        <li key={i} style={it.checked ? { color: "#8A8477" } : undefined}>
          {it.checked !== null && <TaskBox checked={it.checked} />}
          <span style={it.checked ? { textDecoration: "line-through" } : undefined}>
            {renderInlines(it.children, `${keyBase}-${i}`, resolve, onOpen)}
          </span>
          {it.sub.map((sb, j) => <Fragment key={j}>{renderBlock(sb, `${keyBase}-${i}s${j}`, resolve, onOpen)}</Fragment>)}
        </li>
      ))}
    </Tag>
  );
}

function renderBlock(bl: MdBlock, key: string, resolve?: ResolveNode, onOpen?: (id: string) => void): ReactNode {
  switch (bl.t) {
    case "heading":
      return (
        <div key={key} className="dm-display" style={{ fontWeight: 700, fontSize: bl.level <= 2 ? 14.5 : 13, letterSpacing: "-0.01em", color: C.ink, margin: "10px 0 2px" }}>
          {renderInlines(bl.children, key, resolve, onOpen)}
        </div>
      );
    case "para":
      return <p key={key} style={{ margin: "6px 0" }}>{renderInlines(bl.children, key, resolve, onOpen)}</p>;
    case "quote":
      return (
        <blockquote key={key} style={{ margin: "8px 0", padding: "2px 0 2px 12px", borderLeft: `3px solid #E8C9BE`, color: "#57534A" }}>
          {bl.children.map((c, i) => <Fragment key={i}>{renderBlock(c, `${key}-${i}`, resolve, onOpen)}</Fragment>)}
        </blockquote>
      );
    case "codeblock":
      return (
        <pre key={key} className="dm-mono" style={{ margin: "8px 0", padding: "10px 12px", background: "#F3EFE6", border: "1px solid #ECE5D8", borderRadius: 10, fontSize: 11.5, lineHeight: 1.55, overflowX: "auto" }}>
          {bl.code}
        </pre>
      );
    case "hr":
      return <div key={key} style={{ borderTop: "1px dashed #DDD5C5", margin: "12px 0" }} />;
    case "list":
      return <ListBlock key={key} block={bl} keyBase={key} resolve={resolve} onOpen={onOpen} />;
    case "table":
      return (
        <div key={key} style={{ overflowX: "auto", margin: "8px 0" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: "60%" }}>
            <thead>
              <tr>
                {bl.header.map((cell, i) => (
                  <th key={i} className="dm-mono" style={{ textAlign: bl.align[i] ?? "left", fontSize: 10.5, fontWeight: 600, color: "#8A8477", textTransform: "uppercase", letterSpacing: "0.04em", padding: "5px 10px", borderBottom: "1.5px solid #E1D9C8" }}>
                    {renderInlines(cell, `${key}-h${i}`, resolve, onOpen)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bl.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={{ textAlign: bl.align[c] ?? "left", padding: "5px 10px", borderBottom: "1px solid #F1ECDF", color: "#3A352C" }}>
                      {renderInlines(cell, `${key}-r${r}c${c}`, resolve, onOpen)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "mathblock":
      return <MathTex key={key} tex={bl.tex} display />;
  }
}

/** The full-flavor body renderer. `resolveNode` + `onOpen` make [[wikilinks]]
 *  and ![[embeds]] live; without them, links degrade to quiet text. */
export function MarkdownBody({ md, resolveNode, onOpen }: { md: string; resolveNode?: ResolveNode; onOpen?: (id: string) => void }) {
  const blocks = useMemo(() => parseMarkdown(md), [md]);
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#3A352C" }}>
      {blocks.map((bl, i) => <Fragment key={i}>{renderBlock(bl, `b${i}`, resolveNode, onOpen)}</Fragment>)}
    </div>
  );
}
