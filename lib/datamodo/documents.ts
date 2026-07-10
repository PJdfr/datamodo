import { prisma } from "@/lib/prisma";
import { readBlob } from "@/lib/ingest/store";
import type { LlmProvider } from "@/lib/llm";
import { extractFromMessage } from "./extract";
import { ingestExtraction } from "./knowledge";
import {
  attachmentTextKind,
  buildDocumentExtraction,
  extractAttachmentText,
  type DocumentIndexing,
} from "./document-extraction";

// Attachment → document pipeline (the DB/storage side of document-extraction.ts).
// Runs inside the extraction tick, after the message body is ingested: every
// attachment on the item becomes a `document` entity; when we can read its
// text (PDF text layer / plain text) we run the SAME message extractor over it
// and link the document to what it mentions. Fails safe at every step — a
// missing blob bucket, a scanned PDF, or an LLM error degrades that document
// to metadata-only; it never fails the item.

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
      const kind = attachmentTextKind(att.filename, att.content_type);
      if (kind) {
        try {
          const bytes = await readBlob(item.org_id, att.blob_hash);
          const doc = await extractAttachmentText(bytes, kind);
          if (doc.text) {
            const res = await extractFromMessage(
              {
                text: doc.text,
                subject: att.filename ? `Attached document: ${att.filename}` : "Attached document",
                sender: null,
                channel: item.channel,
                businessContext,
              },
              llm,
            );
            inner = res.extraction;
            indexing = doc.truncated ? "partial" : "full";
          }
        } catch (e) {
          console.error(`[documents] attachment ${att.id} text extraction failed`, e);
        }
      }

      const extraction = buildDocumentExtraction(meta, indexing, inner);
      const folded = await ingestExtraction(item.org_id, item.owner_user_id, item.id, extraction, llm);
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
