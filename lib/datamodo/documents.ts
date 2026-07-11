import { prisma } from "@/lib/prisma";
import { readBlob } from "@/lib/ingest/store";
import type { LlmProvider } from "@/lib/llm";
import { extractFromDocument, extractFromImage } from "./extract";
import { createOffTemplateReview, ingestExtraction } from "./knowledge";
import { parseWorkbook } from "./spreadsheet";
import { storeDocChunks } from "./chunks";
import { normalizeKey } from "./knowledge";
import { transcribeAudio } from "@/lib/llm/transcription";
import {
  attachmentAudioType,
  attachmentImageType,
  attachmentTextKind,
  buildDocumentExtraction,
  buildTranscriptBody,
  chunkDocText,
  MAX_AUDIO_BYTES,
  MAX_DOC_CHARS,
  MAX_IMAGE_BYTES,
  extractAttachmentText,
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
      const kind = attachmentTextKind(att.filename, att.content_type);
      const imageType = kind ? null : attachmentImageType(att.filename, att.content_type);
      const audioType = kind || imageType ? null : attachmentAudioType(att.filename, att.content_type);
      if (kind) {
        try {
          const bytes = await readBlob(item.org_id, att.blob_hash);
          doc =
            kind === "sheet"
              ? sheetToText(await parseWorkbook(bytes))
              : await extractAttachmentText(bytes, kind);
          if (doc.text) {
            // Classify-first + template-restrained: the document is distilled
            // to its category's template (+ ≤3 concepts + a markdown summary),
            // never free-ranged like a message.
            const res = await extractFromDocument(
              {
                text: doc.text,
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
            indexing = doc.truncated ? "partial" : "full";
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
            const res = await extractFromDocument(
              {
                text: doc.text,
                filename: att.filename,
                channel: item.channel,
                businessContext,
                kinds,
                concepts,
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

      const extraction = buildDocumentExtraction(meta, indexing, inner);
      const folded = await ingestExtraction(item.org_id, item.owner_user_id, item.id, extraction, llm);

      // Template drops become a pending review instead of vanishing — the
      // user decides "add anyway" or "leave out". Best-effort, never fails
      // the attachment.
      if (offTemplate) {
        try {
          await createOffTemplateReview(item.org_id, item.owner_user_id, {
            itemId: item.id,
            docLabel: att.filename ?? "attachment",
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
            await storeDocChunks(item.org_id, ent.id, item.id, chunkDocText(doc));
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
        filename: att.filename,
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
