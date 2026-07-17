import { prisma } from "@/lib/prisma";
import { readBlob } from "@/lib/ingest/store";
import type { LlmProvider } from "@/lib/llm";
import { classifyDocumentKind, extractFromDocument, extractFromImage } from "./extract";
import { buildContextAnchors, keyTermsFrom, selectChunksForPrompt, DOC_PROMPT_BUDGET_CHARS } from "./chunk-select";
import { embedTexts, embeddingsConfigured, embeddingsModel } from "@/lib/llm/embeddings";
import { createOffTemplateReview, ingestExtraction } from "./knowledge";
import { parseWorkbook } from "./spreadsheet";
import { storeDocChunks } from "./chunks";
import { normalizeKey } from "./knowledge";
import { transcribeAudio } from "@/lib/llm/transcription";
import { convertPdfToMarkdown } from "./pdf-markdown";
import {
  attachmentAudioType,
  attachmentImageType,
  attachmentTextKind,
  buildDocumentExtraction,
  buildTranscriptBody,
  chunkDocText,
  isLikelyScannedPdf,
  rasterizePdfPages,
  MAX_AUDIO_BYTES,
  MAX_DOC_CHARS,
  MAX_IMAGE_BYTES,
  extractAttachmentText,
  interpretableFilename,
  sheetToText,
  type DocumentIndexing,
  DOCUMENT_KIND,
} from "./document-extraction";

// Attachment → document pipeline (the DB/storage side of document-extraction.ts).
// Runs inside the extraction tick, after the message body is ingested: every
// attachment on the item becomes a `document` entity; when we can read its
// text (PDF text layer / plain text) we CLASSIFY it into the user's categories,
// distill it to that category's template (+ concepts + a markdown summary that
// becomes the node's body_md), and link the document to what it mentions.
// Fails safe at every step — a missing blob bucket, a scanned PDF, or an LLM
// error degrades that document to metadata-only; it never fails the item.

/** Context-anchor embeddings, memoized per org shape + embedding space. The
 *  anchors (business context, agent purposes, kind templates) change rarely,
 *  so one warm process embeds them once. Fail-soft: null without a key. */
const anchorCache = new Map<string, number[][]>();
function anchorCacheKey(texts: string[]): string {
  // djb2 over the joined texts — collisions are harmless (wrong anchors only
  // reorder a selection, and the model+length guard makes them unlikely).
  let h = 5381;
  const joined = texts.join("");
  for (let i = 0; i < joined.length; i++) h = ((h * 33) ^ joined.charCodeAt(i)) >>> 0;
  return `${embeddingsModel()}:${joined.length}:${h.toString(36)}`;
}
async function contextAnchorVectors(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0 || !embeddingsConfigured()) return null;
  const key = anchorCacheKey(texts);
  const hit = anchorCache.get(key);
  if (hit) return hit;
  const vectors = await embedTexts(texts);
  if (!vectors) return null;
  if (anchorCache.size > 50) anchorCache.clear(); // tiny process-local cache
  anchorCache.set(key, vectors);
  return vectors;
}

/** What the distill LLM should READ for one document. Short documents pass
 *  whole; long ones (no size limit — user call 2026-07-16) classify from the
 *  head, then the zero-LLM chunk scorer (chunk-select.ts) picks the
 *  passages worth the prompt budget, steered by the classified kind's
 *  template vocabulary and the agents' purposes — and, since 2026-07-17
 *  (GRAPH_PIPELINE.md "Adaptive classifiers (2)"), by semantic closeness to
 *  the org's context anchors: the chunks are embedded BEFORE selection (the
 *  same vectors are then stored on doc_chunks — reordering made the semantic
 *  leg free) and each chunk adds max cosine(chunk, anchor) to its score, so
 *  paraphrase ("risk-adjusted performance" for a `sharpe` field) makes the
 *  prompt even with zero lexical overlap. Fail-soft everywhere. */
async function distillInput(
  doc: { text: string },
  chunks: import("./document-extraction").DocChunk[],
  filename: string | null,
  kinds: import("./ontology").KindDef[] | undefined,
  agents: { name: string; purpose: string }[],
  llm: LlmProvider,
  businessContext?: string | null,
): Promise<{ text: string; docKind: string | null; chunkVectors: (number[] | null)[] | null }> {
  if (doc.text.length <= DOC_PROMPT_BUDGET_CHARS) return { text: doc.text, docKind: null, chunkVectors: null };
  let docKind: string | null = null;
  if (kinds?.length) {
    try {
      docKind = (await classifyDocumentKind({ filename, text: doc.text, kinds }, llm)).kind;
    } catch (e) {
      console.error(`[documents] pre-selection classify failed for "${filename}"`, e);
    }
  }
  const def = kinds?.find((k) => k.kind === docKind);
  const keyTerms = keyTermsFrom(
    def?.description,
    ...(def?.fields.map((f) => `${f.key} ${f.label}`) ?? []),
    ...(def?.relations.map((r) => `${r.predicate} ${r.label}`) ?? []),
    ...agents.map((a) => a.purpose),
  );
  // Semantic leg: chunk vectors (reused at store time) + cached anchors. The
  // classified kind leads the anchor set; other templated kinds ride along.
  let chunkVectors: (number[] | null)[] | null = null;
  let anchorVectors: number[][] | null = null;
  if (embeddingsConfigured()) {
    const anchorKinds = [...(def ? [def] : []), ...(kinds ?? []).filter((k) => k !== def && k.fields.length > 0)];
    [chunkVectors, anchorVectors] = await Promise.all([
      embedTexts(chunks.map((c) => c.text)),
      contextAnchorVectors(buildContextAnchors({ businessContext, agents, kinds: anchorKinds })),
    ]);
  }
  const sel = selectChunksForPrompt(chunks, { keyTerms, chunkVectors, anchorVectors });
  console.log(
    `[documents] chunk selection for "${filename}": ${sel.includedSeqs.length}/${chunks.length} chunks in prompt (${sel.droppedChunks} omitted — still stored + searchable${anchorVectors && chunkVectors ? ", semantic leg on" : ""})`,
  );
  return { text: sel.text, docKind, chunkVectors };
}

export interface AttachmentProcessResult {
  attachmentId: string;
  filename: string | null;
  indexing: DocumentIndexing;
  factsNew: number;
}

interface ItemForDocs {
  id: string;
  org_id: string;
  owner_user_id: string | null;
  channel: string | null;
  subject: string | null;
}

export async function processItemAttachments(
  item: ItemForDocs,
  llm: LlmProvider,
  businessContext?: string | null,
  kinds?: import("./ontology").KindDef[],
  concepts?: string[],
): Promise<AttachmentProcessResult[]> {
  const atts = await prisma.attachments.findMany({
    where: { item_id: item.id },
    select: { id: true, filename: true, content_type: true, bytes: true, blob_hash: true },
  });

  // Document context (user call 2026-07-16: "a dropped PDF usually means
  // extract to a template/table"): the user's agents (why documents arrive)
  // and tables (where fields should land) ride the distill prompt. Loaded
  // once per item; best-effort — extraction works without either.
  const agents = await prisma.agents
    .findMany({
      where: { org_id: item.org_id, status: "active", NOT: { purpose_text: null } },
      select: { name: true, purpose_text: true },
      take: 6,
    })
    .then((rows) => rows.map((a) => ({ name: a.name, purpose: (a.purpose_text ?? "").slice(0, 160) })))
    .catch(() => []);
  const tables = await prisma.datasets
    .findMany({
      where: { org_id: item.org_id },
      select: { name: true, columns: true },
      orderBy: { updated_at: "desc" },
      take: 8,
    })
    .then((rows) =>
      rows.map((d) => ({
        name: d.name,
        columns: (Array.isArray(d.columns) ? (d.columns as { key?: string }[]) : [])
          .map((c) => c.key ?? "")
          .filter(Boolean)
          .slice(0, 10),
      })),
    )
    .catch(() => []);

  const results: AttachmentProcessResult[] = [];
  for (const att of atts) {
    try {
      const meta = {
        filename: att.filename,
        contentType: att.content_type,
        bytes: Number(att.bytes ?? 0),
        blobHash: att.blob_hash,
      };

      // Read + extract the text layer, degrading to metadata-only on any
      // failure (bucket not provisioned yet, image-only PDF, bad bytes…).
      let indexing: DocumentIndexing = "metadata_only";
      let inner = null;
      let summary: string | null = null;
      let docKind: string | null = null;
      let offTemplate: import("./ontology").OffTemplateReviewPayload | null = null;
      let doc: Awaited<ReturnType<typeof extractAttachmentText>> | null = null;
      // Chunk embeddings computed BEFORE selection (semantic leg) — reused at
      // store time so the document is never embedded twice.
      let chunkVectors: (number[] | null)[] | null = null;
      const kind = attachmentTextKind(att.filename, att.content_type);
      const imageType = kind ? null : attachmentImageType(att.filename, att.content_type);
      const audioType = kind || imageType ? null : attachmentAudioType(att.filename, att.content_type);
      if (kind) {
        try {
          const bytes = await readBlob(item.org_id, att.blob_hash);
          // PDFs try the structure-preserving converter seam first
          // (PDF_MARKDOWN_COMMAND, GRAPH_PIPELINE.md P3) — markdown output
          // gets section-aligned chunks and a structured prompt; null (seam
          // off / converter failed / scan) falls back to the unpdf text
          // layer, which also keeps the scanned-PDF vision detection intact.
          const md = kind === "pdf" ? await convertPdfToMarkdown(bytes) : null;
          doc =
            md ??
            (kind === "sheet"
              ? sheetToText(await parseWorkbook(bytes))
              : await extractAttachmentText(bytes, kind));
          if (doc.text) {
            // Classify-first + template-restrained: the document is distilled
            // to its category's template (+ ≤3 concepts + a markdown summary),
            // never free-ranged like a message. Relevance priming runs on the
            // DOCUMENT's own text (labels in it + one embedding) — fail-soft.
            const known = await import("./priming")
              .then(({ primeKnownEntities }) => primeKnownEntities(item.org_id, doc!.text))
              .catch(() => []);
            // No size limit: the WHOLE document is chunked; the prompt gets
            // the important chunks only (classify from the head, then the
            // zero-LLM scorer — chunk-select.ts).
            const di = await distillInput(doc, chunkDocText(doc), att.filename, kinds, agents, llm, businessContext);
            chunkVectors = di.chunkVectors;
            const res = await extractFromDocument(
              {
                text: di.text,
                docKind: di.docKind ?? undefined,
                filename: att.filename,
                channel: item.channel,
                businessContext,
                kinds,
                concepts,
                agents,
                tables,
                known,
              },
              llm,
            );
            inner = res.extraction;
            summary = res.summary;
            docKind = res.docKind;
            offTemplate = res.offTemplateReview;
            indexing = doc.truncated ? "partial" : "full";
          } else if (kind === "pdf" && isLikelyScannedPdf(doc) && meta.bytes <= MAX_IMAGE_BYTES && process.env.PDF_SCAN_VISION === "1") {
            // SCANNED PDF: no text layer — the content is pixels. OPT-IN
            // (user call 2026-07-16: no vision on PDFs for now): set
            // PDF_SCAN_VISION=1 to rasterize the pages (up to MAX_SCAN_PAGES
            // / the payload budget) and read them in ONE vision call, same
            // tier as a photo. Off / no canvas / no vision key → the scan
            // stays metadata_only (the blob is archived; a requeue after
            // enabling the flag re-reads it). Photos/screenshots are NOT
            // affected — only PDFs whose text layer is empty.
            const scan = await rasterizePdfPages(bytes, doc.pages ?? 1);
            if (scan && scan.pages.length > 0) {
              const [first, ...rest] = scan.pages;
              const res = await extractFromImage(
                {
                  imageBase64: first.imageBase64,
                  mediaType: first.mediaType,
                  additionalPages: rest.map((p) => ({ imageBase64: p.imageBase64, mediaType: p.mediaType })),
                  filename: att.filename,
                  channel: item.channel,
                  businessContext,
                  kinds,
                  concepts,
                },
                llm,
              );
              inner = res.extraction;
              summary = res.summary;
              docKind = res.docKind;
              offTemplate = res.offTemplateReview;
              // Every page seen → "full"; pages dropped by the caps → partial.
              indexing = scan.truncated ? "partial" : "full";
              if (summary) doc = { text: summary, truncated: scan.truncated, pages: doc.pages };
            }
          }
        } catch (e) {
          console.error(`[documents] attachment ${att.id} text extraction failed`, e);
        }
      } else if (imageType && meta.bytes > 0 && meta.bytes <= MAX_IMAGE_BYTES) {
        // Vision tier: a photo/screenshot becomes an understood thick node.
        // Any failure (blind model, no key, bad bytes) degrades to
        // metadata_only exactly like an unreadable PDF.
        try {
          const bytes = await readBlob(item.org_id, att.blob_hash);
          const res = await extractFromImage(
            {
              imageBase64: bytes.toString("base64"),
              mediaType: imageType,
              filename: att.filename,
              channel: item.channel,
              businessContext,
              kinds,
              concepts,
            },
            llm,
          );
          inner = res.extraction;
          summary = res.summary;
          docKind = res.docKind;
          offTemplate = res.offTemplateReview;
          indexing = "full";
          // The distillation is the image's only text — chunk it so passage
          // search can cite what the image says.
          if (summary) doc = { text: summary, truncated: false, pages: null };
        } catch (e) {
          console.error(`[documents] attachment ${att.id} vision extraction failed`, e);
        }
      } else if (audioType && meta.bytes > 0 && meta.bytes <= MAX_AUDIO_BYTES) {
        // Audio tier: a voice memo/recording becomes an understood thick node.
        // Transcribe (fail-soft: no key / API error → null), then the
        // transcript runs through the SAME classify-first document pipeline.
        // Any failure degrades to metadata_only exactly like a scanned PDF.
        try {
          const bytes = await readBlob(item.org_id, att.blob_hash);
          const transcript = await transcribeAudio({ bytes, mediaType: audioType, filename: att.filename });
          if (transcript) {
            doc = {
              text: transcript.slice(0, MAX_DOC_CHARS),
              truncated: transcript.length > MAX_DOC_CHARS,
              pages: null,
            };
            // Long transcripts get the same chunk-importance selection as
            // long documents — the full transcript still lands in doc_chunks.
            const di = await distillInput(doc, chunkDocText(doc), att.filename, kinds, agents, llm, businessContext);
            chunkVectors = di.chunkVectors;
            const res = await extractFromDocument(
              {
                text: di.text,
                docKind: di.docKind ?? undefined,
                filename: att.filename,
                channel: item.channel,
                businessContext,
                kinds,
                concepts,
                agents,
                tables,
              },
              llm,
            );
            inner = res.extraction;
            // The node's page is player + transcript: summary first, then the
            // transcript itself (capped; the full text lives in doc_chunks).
            summary = buildTranscriptBody(res.summary, doc.text);
            docKind = res.docKind;
            offTemplate = res.offTemplateReview;
            indexing = doc.truncated ? "partial" : "full";
          }
        } catch (e) {
          console.error(`[documents] attachment ${att.id} audio extraction failed`, e);
        }
      }

      // NON-UNDERSTANDABLE NAME → an interpretable one (user request
      // 2026-07-16): once the document is UNDERSTOOD, a machine name
      // (scan0001.pdf, IMG_2043.jpg, a UUID) is replaced by what the document
      // IS — kind + primary subject — BEFORE it's saved anywhere the user
      // reads: the attachments row, the document entity's label/natural key,
      // reviews, the parse reply. Human-looking names are never touched, and
      // the original is kept as an original_filename fact. Re-runs are
      // stable: the renamed file is no longer cryptic, so it keeps its name
      // (and its natural key) on reprocessing.
      const renamedFrom = att.filename;
      const better = interpretableFilename(att.filename, inner?.entities[0]?.label, docKind);
      if (better) {
        meta.filename = better;
        await prisma.attachments
          .update({ where: { id: att.id }, data: { filename: better } })
          .catch((e) => console.error(`[documents] filename update failed for ${att.id}`, e));
        console.log(`[documents] renamed "${renamedFrom ?? "(unnamed)"}" → "${better}" (${docKind ?? "document"})`);
      }

      const extraction = buildDocumentExtraction(meta, indexing, inner);
      if (better && renamedFrom) {
        extraction.facts.push({
          subjectLocalId: extraction.entities[0].localId,
          predicate: "original_filename",
          cardinality: "one",
          value: { kind: "text", text: renamedFrom },
        });
      }
      const folded = await ingestExtraction(item.org_id, item.owner_user_id, item.id, extraction, llm);

      // Template drops become a pending review instead of vanishing — the
      // user decides "add anyway" or "leave out". Best-effort, never fails
      // the attachment.
      if (offTemplate) {
        try {
          await createOffTemplateReview(item.org_id, item.owner_user_id, {
            itemId: item.id,
            docLabel: meta.filename ?? "attachment",
            docKind,
            extraction: offTemplate.extraction,
            display: offTemplate.display,
          });
        } catch (e) {
          console.error(`[documents] off-template review filing failed for ${att.id}`, e);
        }
      }

      // Evidence + body: keep the document's PASSAGES (facts alone lose the
      // prose) and write the generated markdown summary as the node's body —
      // the thick node's readable page. Resolve the doc entity by its
      // deterministic natural key. Best-effort — never fails the attachment.
      if (doc?.text) {
        try {
          const docEntity = extraction.entities[0];
          const ent = await prisma.entities.findFirst({
            where: {
              org_id: item.org_id,
              kind: DOCUMENT_KIND,
              normalized_key: normalizeKey(docEntity),
              merged_into: null,
            },
            select: { id: true },
          });
          if (ent) {
            await storeDocChunks(item.org_id, ent.id, item.id, chunkDocText(doc), chunkVectors);
            if (summary) {
              await prisma.entities.update({
                where: { id: ent.id, org_id: item.org_id },
                data: { body_md: summary, updated_at: new Date() },
              });
            }
          }
        } catch (e) {
          console.error(`[documents] chunk store failed for attachment ${att.id}`, e);
        }
      }
      results.push({
        attachmentId: att.id,
        filename: meta.filename, // the interpretable name when renamed
        indexing,
        factsNew: folded.factsNew,
      });
    } catch (e) {
      // One bad attachment never blocks the rest (or the item).
      console.error(`[documents] attachment ${att.id} failed`, e);
    }
  }
  return results;
}
