import { prisma } from "@/lib/prisma";
import { readBlob } from "@/lib/ingest/store";
import type { LlmProvider } from "@/lib/llm";
import { extractFromDocument } from "./extract";
import { ingestExtraction } from "./knowledge";
import { parseWorkbook } from "./spreadsheet";
import { storeDocChunks } from "./chunks";
import { normalizeKey } from "./knowledge";
import {
  attachmentTextKind,
  buildDocumentExtraction,
  chunkDocText,
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
      let doc: Awaited<ReturnType<typeof extractAttachmentText>> | null = null;
      const kind = attachmentTextKind(att.filename, att.content_type);
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
            indexing = doc.truncated ? "partial" : "full";
          }
        } catch (e) {
          console.error(`[documents] attachment ${att.id} text extraction failed`, e);
        }
      }

      const extraction = buildDocumentExtraction(meta, indexing, inner);
      const folded = await ingestExtraction(item.org_id, item.owner_user_id, item.id, extraction, llm);

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
