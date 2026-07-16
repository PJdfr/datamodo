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

/** Media types a vision model accepts; keys double as extension matches. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Keep well under provider per-image caps (~5 MB) with base64 overhead. */
export const MAX_IMAGE_BYTES = 3_500_000;

/** Media types the transcription tier accepts; keys double as extension
 *  matches. Mirrors what Whisper-shaped APIs decode AND what a browser
 *  <audio> element can play back (the node's player streams the original). */
const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
};

/** Whisper-shaped endpoints cap uploads at 25 MB; leave headroom. */
export const MAX_AUDIO_BYTES = 24_000_000;

/** The audio tier's gate: the attachment's audio media type, or null when it
 *  isn't audio a transcription model can hear. */
export function attachmentAudioType(
  filename: string | null,
  contentType: string | null,
): string | null {
  const ct = (contentType ?? "").toLowerCase().split(";")[0].trim();
  const ext = /\.([a-z0-9]+)$/.exec((filename ?? "").toLowerCase())?.[1];
  // Extension first: senders often ship audio as application/octet-stream,
  // and a known extension also normalizes vague types (audio/x-m4a → audio/mp4).
  if (ext && AUDIO_TYPES[ext]) return AUDIO_TYPES[ext];
  if (Object.values(AUDIO_TYPES).includes(ct)) return ct;
  if (ct.startsWith("audio/")) return ct; // uncommon container — let the transcriber try
  return null;
}

/** The vision tier's gate: the attachment's image media type, or null when it
 *  isn't an image a vision model can read. */
export function attachmentImageType(
  filename: string | null,
  contentType: string | null,
): string | null {
  const ct = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (Object.values(IMAGE_TYPES).includes(ct)) return ct;
  const ext = /\.([a-z0-9]+)$/.exec((filename ?? "").toLowerCase())?.[1];
  return (ext && IMAGE_TYPES[ext]) || null;
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

/** A PDF whose text layer is empty/near-empty is a SCAN — the content is
 *  pixels, not text. Below this many extracted chars per page we treat it as
 *  scanned and route it to the vision tier (rasterize → extractFromImage)
 *  instead of leaving it metadata_only. Deterministic, unit-tested. */
export const SCANNED_PDF_CHARS_PER_PAGE = 24;

export function isLikelyScannedPdf(doc: Pick<ExtractedDocText, "text" | "pages">): boolean {
  if (!doc.pages || doc.pages < 1) return false; // not a PDF (no page count)
  const chars = doc.text.replace(/\s/g, "").length;
  return chars < SCANNED_PDF_CHARS_PER_PAGE * doc.pages;
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

/** How much of a scanned PDF the vision tier reads in ONE call: at most this
 *  many pages, and at most ~this much base64 across them (a page at scale 2
 *  is roughly 0.3–1.5 MB base64; vision payloads have real limits). Pages
 *  beyond either cap are dropped and the result is marked truncated. */
export const MAX_SCAN_PAGES = 6;
export const MAX_SCAN_BASE64_CHARS = 9_000_000; // ≈ 6.7 MB of image bytes

export interface RasterizedScan {
  /** 1-based consecutive pages, always starting at page 1. */
  pages: { imageBase64: string; mediaType: string; page: number }[];
  /** True when the document had more pages than we rasterized. */
  truncated: boolean;
}

/** Rasterize a scanned PDF's pages to PNGs for the vision tier — page 1 up to
 *  MAX_SCAN_PAGES, stopping early when the payload budget is spent. Returns
 *  null (never throws) when rendering isn't possible at all (no canvas
 *  backend, corrupt PDF) — the caller then stays metadata_only exactly as
 *  before. A failure on page N>1 keeps pages 1..N-1 (truncated), because a
 *  partially read scan still beats an unread one. `scale: 2` keeps text
 *  legible without ballooning the payload. */
export async function rasterizePdfPages(bytes: Uint8Array, totalPages: number): Promise<RasterizedScan | null> {
  const want = Math.max(1, Math.min(totalPages || 1, MAX_SCAN_PAGES));
  const pages: RasterizedScan["pages"] = [];
  let budget = MAX_SCAN_BASE64_CHARS;
  for (let page = 1; page <= want; page++) {
    try {
      const { renderPageAsImage } = await import("unpdf");
      const buf = await renderPageAsImage(new Uint8Array(bytes), page, {
        scale: 2,
        canvasImport: () => import("@napi-rs/canvas") as unknown as Promise<typeof import("@napi-rs/canvas")>,
      });
      const imageBase64 = Buffer.from(buf).toString("base64");
      if (pages.length > 0 && imageBase64.length > budget) {
        return { pages, truncated: true }; // budget spent — ship what we have
      }
      budget -= imageBase64.length;
      pages.push({ imageBase64, mediaType: "image/png", page });
    } catch (e) {
      console.error(`[documents] scanned-PDF rasterization failed on page ${page}`, e);
      if (pages.length === 0) return null;
      return { pages, truncated: true };
    }
  }
  return { pages, truncated: (totalPages || 1) > want };
}

/** Back-compat shim: just the first page (kept for tests/tooling). */
export async function rasterizePdfFirstPage(bytes: Uint8Array): Promise<{ imageBase64: string; mediaType: string } | null> {
  const scan = await rasterizePdfPages(bytes, 1);
  return scan?.pages[0] ? { imageBase64: scan.pages[0].imageBase64, mediaType: scan.pages[0].mediaType } : null;
}

// --- Chunks: the evidence layer -------------------------------------------------

/* ---- interpretable filenames (user request 2026-07-16) --------------------
 * Camera rolls, scanners and messengers name files for machines
 * (IMG_20260716_123456.jpg, scan0001.pdf, a UUID). Once the pipeline has
 * UNDERSTOOD the document, we can name it for humans instead — kind +
 * primary subject — before it's saved anywhere the user will read it.
 * Pure + conservative: renaming a name the user chose is worse than keeping
 * a cryptic one, so anything that might be human-authored stays. */

const CRYPTIC_PATTERNS: RegExp[] = [
  // Camera / phone / scanner counters: IMG_1234, DSC0001, PXL_2026…, scan-12
  /^(img|image|dsc|dscn|dscf|pxl|dcim|mvimg|gopr|vid|mov|scan|scanned|snap)[ _-]?\d{2,}/i,
  // Generic no-name names, numbered or not: "document (3)", "file2", "untitled"
  /^(image|img|photo|pic|picture|scan|document|doc|file|attachment|untitled|unnamed|new ?doc(ument)?|sans[ -]?titre|screenshot|capture|export|download|data|temp|tmp)[ _()-]*\d*[ _()-]*$/i,
  // Messenger exports: "WhatsApp Image 2026-07-16 at …", "signal-2026-…"
  /^(whatsapp|signal|telegram)[ _-]?(image|document|video|audio)?[ _-]?\d{4}/i,
  // Screenshot timestamps: "Screenshot 2026-07-16 at 12.30.01"
  /^(screen ?shot|screen ?capture|capture)[ _-]?\d{4}/i,
  // Pure timestamps: 20260716_123456, 2026-07-16 12.30.01
  /^\d{8}[ _-]?\d{4,6}$/,
  /^\d{4}-\d{2}-\d{2}[ _.]?\d{0,2}[ _.:-]?\d{0,2}[ _.:-]?\d{0,2}$/,
  // UUIDs / long hex / long digit runs
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[0-9a-f]{12,}$/i,
  /^\d{6,}$/,
];

/** Machine-named? (null/empty counts.) Judged on the stem, extension aside. */
export function isCrypticFilename(filename: string | null | undefined): boolean {
  const stem = (filename ?? "").replace(/\.[A-Za-z0-9]{1,8}$/, "").trim();
  if (!stem) return true;
  if (CRYPTIC_PATTERNS.some((re) => re.test(stem))) return true;
  // A letterless stem ("12 34-56") says nothing either.
  if (!/[a-z]/i.test(stem)) return true;
  return false;
}

/** The human name for an understood document: `<kind>-<primary subject>.<ext>`
 *  (slugified, deduped when the label already names the kind). Returns null
 *  when the original deserves to stay: it's not cryptic, or the extraction
 *  didn't produce a usable primary label. */
export function interpretableFilename(
  original: string | null | undefined,
  primaryLabel: string | null | undefined,
  docKind: string | null | undefined,
): string | null {
  if (!isCrypticFilename(original)) return null;
  const slug = (s: string) =>
    s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const labelSlug = slug(primaryLabel?.trim() ?? "");
  if (labelSlug.length < 3) return null; // nothing meaningful to name it after
  const kindSlug = slug(docKind ?? "");
  const base = kindSlug && !labelSlug.startsWith(kindSlug) ? `${kindSlug}-${labelSlug}` : labelSlug;
  const ext = original?.match(/\.[A-Za-z0-9]{1,8}$/)?.[0]?.toLowerCase() ?? "";
  const name = base.slice(0, 60).replace(/-+$/, "") + ext;
  return name === original ? null : name;
}

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

/** ≥2 markdown headings = structured text (a converter's output or authored
 *  markdown) — chunking should follow sections, not blind paragraphs. */
export function looksLikeMarkdown(text: string): boolean {
  return (text.match(/^#{1,6}\s+\S/gm) ?? []).length >= 2;
}

/** Section-aligned chunking for markdown (GRAPH_PIPELINE.md P3): split on
 *  heading lines, size-chunk within each section, and prefix every piece with
 *  its heading so a cited passage always says which section it came from. */
function chunkMarkdownSections(text: string): DocChunk[] {
  const lines = text.split("\n");
  const sections: { heading: string; body: string[] }[] = [{ heading: "", body: [] }];
  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) sections.push({ heading: line.trim(), body: [] });
    else sections[sections.length - 1].body.push(line);
  }
  const chunks: DocChunk[] = [];
  for (const s of sections) {
    for (const piece of splitBlock(s.body.join("\n"))) {
      chunks.push({ seq: chunks.length, page: null, text: s.heading ? `${s.heading}\n\n${piece}` : piece });
      if (chunks.length >= MAX_CHUNKS) return chunks;
    }
  }
  return chunks;
}

/** Chunk a document's text for the evidence layer. PDFs chunk per page (page
 *  lineage survives into citations); markdown chunks per SECTION (heading
 *  lineage instead); plain text chunks by paragraphs. */
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
  if (looksLikeMarkdown(doc.text)) return chunkMarkdownSections(doc.text);
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

// --- Audio: player + transcript is the node's natural shape ---------------------
// The audio tier stores the distilled summary AND the transcript in the node's
// body (body_md) — the page IS player + transcript (north star: audio's natural
// shape). The transcript also lands in doc_chunks, so passage search can cite
// what was said even when the body caps it.

export const TRANSCRIPT_HEADING = "#### Transcript";

/** Keep the readable page bounded; the FULL transcript stays in doc_chunks. */
export const MAX_TRANSCRIPT_BODY_CHARS = 8_000;

/** Compose an audio node's body: the generated summary first, then the
 *  transcript under a heading (capped, with an honest truncation note).
 *  Null only when there is neither. */
export function buildTranscriptBody(summary: string | null, transcript: string): string | null {
  const t = transcript.trim();
  if (!t) return summary?.trim() || null;
  const capped =
    t.length > MAX_TRANSCRIPT_BODY_CHARS
      ? t.slice(0, MAX_TRANSCRIPT_BODY_CHARS).trimEnd() +
        "\n\n*… transcript truncated here — the full text is still searchable.*"
      : t;
  return [summary?.trim() || null, `${TRANSCRIPT_HEADING}\n\n${capped}`].filter(Boolean).join("\n\n");
}

// --- Generated notes: a dump becomes a thick node WE author ---------------------
// The product never asks the user to write structured notes — they dump prose
// into any channel and the PIPELINE authors the note: a distilled markdown body
// (stored as entities.body_md) plus machine-made "wikilinks" — real mentions/
// about edges to the entities the message extraction found in the same text.

export const NOTE_KIND = "note";

export interface GeneratedNote {
  title: string;
  /** Distilled markdown of the user's dump — their points, faithfully. */
  body: string;
}

/** The note entity's stable local id inside the composed extraction. */
const NOTE_LOCAL_ID = "note";

/**
 * Compose the Extraction that lands one generated note in the graph: the note
 * entity (natural key = the source item id, so re-extraction of the same
 * message dedupes to one node) + edges to the entities the message extraction
 * already found (NOT their facts — those were ingested by the message pass).
 */
export function buildNoteExtraction(
  itemId: string,
  note: GeneratedNote,
  inner: Extraction,
): Extraction {
  const noteEntity: ExtractedEntity = {
    localId: NOTE_LOCAL_ID,
    kind: NOTE_KIND,
    label: note.title.trim().slice(0, 120) || "Note",
    naturalKeys: { id: `note:${itemId}` },
  };
  // Re-namespace inner ids ("e1" → "n:e1") so they can never collide with ours;
  // strip everything but identity — resolution will find the already-ingested
  // canonical entities and only the note edges are new.
  const ns = (localId: string) => `n:${localId}`;
  const entities: ExtractedEntity[] = [
    noteEntity,
    ...inner.entities.map((e) => ({ localId: ns(e.localId), kind: e.kind, label: e.label, naturalKeys: e.naturalKeys })),
  ];
  const facts: ExtractedFact[] = inner.entities.map((e) => ({
    subjectLocalId: NOTE_LOCAL_ID,
    predicate: e.kind === "concept" ? "about" : "mentions",
    cardinality: "many" as const,
    value: { kind: "entity" as const, entityLocalId: ns(e.localId) },
  }));
  return { entities, facts };
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
  // The graph edges that make smart folders work: document —mentions→ entity,
  // except concepts, which get the more meaningful —about→ (the Obsidian-style
  // "map of content" edge).
  for (const e of inner.entities) {
    facts.push({
      subjectLocalId: DOC_LOCAL_ID,
      predicate: e.kind === "concept" ? "about" : "mentions",
      cardinality: "many",
      value: { kind: "entity", entityLocalId: ns(e.localId) },
    });
  }
  return { entities, facts };
}
