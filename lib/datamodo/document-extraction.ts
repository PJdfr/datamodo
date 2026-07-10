import type { Extraction, ExtractedEntity, ExtractedFact } from "./knowledge";

// Attachments → documents in the knowledge graph (pure core, no DB access).
//
// The product decision (PROJECT_STATE "Attachments → documents"): the binary
// always stays in blob storage; its MEANING lives in the graph. Every
// attachment becomes a `document` entity (natural key = blob hash + filename,
// so the same file re-forwarded dedupes to one node), with attribute facts
// (file type / size / how much of it we indexed) and `mentions` relationship
// facts to whatever entities its text talks about. Smart folders are then just
// projections over those relationship facts — nothing is ever physically filed.
//
// This module is pure so it can be unit-tested without Prisma or storage:
// `buildDocumentExtraction` composes the combined Extraction that
// `ingestExtraction` folds in; `extractAttachmentText` pulls the text layer
// out of a PDF (via unpdf) or a plain-text attachment, with hard caps so a
// 400-page PDF can't blow up a prompt.

export const DOCUMENT_KIND = "document";

/** How much of the document's content made it into the graph. */
export type DocumentIndexing = "full" | "partial" | "metadata_only";

/** Guardrails for big documents: index the first N pages / M chars, mark the
 *  entity `partial`, never inline more into a prompt. */
export const MAX_DOC_PAGES = 20;
export const MAX_DOC_CHARS = 20_000;

export interface AttachmentMeta {
  filename: string | null;
  contentType: string | null;
  bytes: number;
  blobHash: string;
}

/** Which text-extraction path an attachment supports (OCR is a later tier).
 *  "sheet" is handled by the orchestrator via the existing xlsx parser. */
export function attachmentTextKind(
  filename: string | null,
  contentType: string | null,
): "pdf" | "text" | "sheet" | null {
  const name = (filename ?? "").toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (ct.includes("spreadsheetml") || ct.includes("ms-excel") || name.endsWith(".xlsx")) return "sheet";
  if (
    ct.startsWith("text/") ||
    ct.includes("json") ||
    ct.includes("csv") ||
    /\.(txt|csv|md|json)$/.test(name)
  ) {
    return "text";
  }
  return null;
}

export interface ExtractedDocText {
  text: string;
  truncated: boolean;
  /** Total pages in the source (PDF only). */
  pages: number | null;
  /** Per-page text for chunking, 1-based page numbers (PDF only). */
  pageTexts?: { page: number; text: string }[];
}

/** Pull the text layer out of an attachment's bytes, capped. Throws on
 *  unparseable input — the caller degrades to metadata-only indexing. */
export async function extractAttachmentText(
  bytes: Uint8Array,
  kind: "pdf" | "text",
): Promise<ExtractedDocText> {
  if (kind === "pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const kept = text.slice(0, MAX_DOC_PAGES);
    const joined = kept.join("\n\n").trim();
    const truncated = totalPages > MAX_DOC_PAGES || joined.length > MAX_DOC_CHARS;
    return {
      text: joined.slice(0, MAX_DOC_CHARS),
      truncated,
      pages: totalPages,
      pageTexts: kept.map((t, i) => ({ page: i + 1, text: t.trim() })).filter((p) => p.text),
    };
  }
  const s = Buffer.from(bytes).toString("utf8").trim();
  return { text: s.slice(0, MAX_DOC_CHARS), truncated: s.length > MAX_DOC_CHARS, pages: null };
}

// --- Chunks: the evidence layer -------------------------------------------------

export interface DocChunk {
  seq: number;
  page: number | null;
  text: string;
}

/** Target chunk size (chars) and a hard cap on chunks per document. */
export const CHUNK_SIZE = 1200;
export const MAX_CHUNKS = 60;

/** Split one block of text into ~CHUNK_SIZE pieces on paragraph, then
 *  sentence boundaries — never mid-word unless a single token exceeds it. */
function splitBlock(text: string): string[] {
  const clean = text.replace(/[ \t]+/g, " ").trim();
  if (clean.length <= CHUNK_SIZE) return clean ? [clean] : [];
  const paras = clean.split(/\n\s*\n/);
  const out: string[] = [];
  let buf = "";
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ""; };
  for (const p of paras) {
    if (buf.length + p.length + 2 <= CHUNK_SIZE) { buf += (buf ? "\n\n" : "") + p; continue; }
    flush();
    if (p.length <= CHUNK_SIZE) { buf = p; continue; }
    // Paragraph itself too long → sentence-ish splits, then hard cuts.
    let rest = p;
    while (rest.length > CHUNK_SIZE) {
      const window = rest.slice(0, CHUNK_SIZE);
      const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
      const at = cut > CHUNK_SIZE * 0.4 ? cut + 1 : CHUNK_SIZE;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at);
    }
    buf = rest;
  }
  flush();
  return out;
}

/** Chunk a document's text for the evidence layer. PDFs chunk per page (page
 *  lineage survives into citations); plain text chunks by paragraphs. */
export function chunkDocText(doc: ExtractedDocText): DocChunk[] {
  const chunks: DocChunk[] = [];
  if (doc.pageTexts?.length) {
    for (const p of doc.pageTexts) {
      for (const piece of splitBlock(p.text)) {
        chunks.push({ seq: chunks.length, page: p.page, text: piece });
        if (chunks.length >= MAX_CHUNKS) return chunks;
      }
    }
    return chunks;
  }
  for (const piece of splitBlock(doc.text)) {
    chunks.push({ seq: chunks.length, page: null, text: piece });
    if (chunks.length >= MAX_CHUNKS) break;
  }
  return chunks;
}

/** Spreadsheets: index at most this many data rows into the prompt. */
export const MAX_SHEET_ROWS = 200;

/** Flatten a parsed workbook (see lib/datamodo/spreadsheet.ts parseWorkbook)
 *  into prompt-ready text: a header line then one pipe-separated line per row,
 *  capped like every other document. */
export function sheetToText(sheet: {
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}): ExtractedDocText {
  if (sheet.columns.length === 0) return { text: "", truncated: false, pages: null };
  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const lines = [
    sheet.columns.map((c) => c.label).join(" | "),
    ...sheet.rows.slice(0, MAX_SHEET_ROWS).map((r) => sheet.columns.map((c) => cell(r[c.key])).join(" | ")),
  ];
  const joined = lines.join("\n").trim();
  const truncated = sheet.rows.length > MAX_SHEET_ROWS || joined.length > MAX_DOC_CHARS;
  return { text: joined.slice(0, MAX_DOC_CHARS), truncated, pages: null };
}

/** The document entity's stable local id inside the composed extraction. */
const DOC_LOCAL_ID = "doc";

/**
 * Compose the Extraction that turns one attachment into graph knowledge:
 * the document entity itself (+ its attribute facts), everything the LLM
 * pulled out of its text (`inner`, entity localIds re-namespaced so they can
 * never collide with ours), and a `mentions` edge from the document to each
 * extracted entity. Pass `inner: null` when no text could be read — the
 * document still lands in the graph as a metadata-only node.
 */
export function buildDocumentExtraction(
  att: AttachmentMeta,
  indexing: DocumentIndexing,
  inner: Extraction | null,
): Extraction {
  const label = att.filename?.trim() || "attachment";
  const doc: ExtractedEntity = {
    localId: DOC_LOCAL_ID,
    kind: DOCUMENT_KIND,
    label,
    // Same bytes + same name = the same document, wherever it arrives from.
    naturalKeys: { id: `doc:${att.blobHash}:${label.toLowerCase()}` },
  };

  const facts: ExtractedFact[] = [
    ...(att.contentType
      ? [{
          subjectLocalId: DOC_LOCAL_ID,
          predicate: "file_type",
          cardinality: "one" as const,
          value: { kind: "text" as const, text: att.contentType },
        }]
      : []),
    ...(att.bytes > 0
      ? [{
          subjectLocalId: DOC_LOCAL_ID,
          predicate: "file_size",
          cardinality: "one" as const,
          value: { kind: "number" as const, num: att.bytes, unit: "bytes" },
        }]
      : []),
    {
      subjectLocalId: DOC_LOCAL_ID,
      predicate: "indexed",
      cardinality: "one",
      value: { kind: "text", text: indexing },
    },
  ];

  if (!inner) return { entities: [doc], facts };

  // Re-namespace the inner extraction's local ids ("e1" → "d:e1") so they can
  // never collide with the document's own id.
  const ns = (localId: string) => `d:${localId}`;
  const entities: ExtractedEntity[] = [
    doc,
    ...inner.entities.map((e) => ({ ...e, localId: ns(e.localId) })),
  ];
  const innerIds = new Set(inner.entities.map((e) => e.localId));
  for (const f of inner.facts) {
    if (!innerIds.has(f.subjectLocalId)) continue; // defensive: dangling ref
    if (f.value.kind === "entity" && !innerIds.has(f.value.entityLocalId)) continue;
    facts.push({
      ...f,
      subjectLocalId: ns(f.subjectLocalId),
      value:
        f.value.kind === "entity"
          ? { kind: "entity", entityLocalId: ns(f.value.entityLocalId) }
          : f.value,
    });
  }
  // The graph edges that make smart folders work: document —mentions→ entity.
  for (const e of inner.entities) {
    facts.push({
      subjectLocalId: DOC_LOCAL_ID,
      predicate: "mentions",
      cardinality: "many",
      value: { kind: "entity", entityLocalId: ns(e.localId) },
    });
  }
  return { entities, facts };
}
