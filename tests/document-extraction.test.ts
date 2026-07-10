// Unit tests for the pure attachment → document-graph core.
// Run with: npm test   (node --experimental-strip-types --test)
// No framework, no DB, no network — the PDF fixture is generated in-process.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentTextKind,
  buildDocumentExtraction,
  extractAttachmentText,
  MAX_DOC_CHARS,
  DOCUMENT_KIND,
  type AttachmentMeta,
} from "../lib/datamodo/document-extraction.ts";
import type { Extraction } from "../lib/datamodo/knowledge.ts";

// --- fixture: a minimal but VALID single-xref PDF, one page per string -------

function makePdf(pageTexts: string[]): Uint8Array {
  const objs: string[] = [];
  const kidIds = pageTexts.map((_, i) => 3 + i * 2);
  objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objs.push(`<< /Type /Pages /Kids [${kidIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`);
  for (let i = 0; i < pageTexts.length; i++) {
    const contentId = 3 + i * 2 + 1;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${3 + pageTexts.length * 2} 0 R >> >> >>`);
    const stream = `BT /F1 12 Tf 72 720 Td (${pageTexts[i].replace(/([()\\])/g, "\\$1")}) Tj ET`;
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(body);
}

// --- attachmentTextKind -------------------------------------------------------

test("attachmentTextKind: pdf by content type or filename", () => {
  assert.equal(attachmentTextKind("x.bin", "application/pdf"), "pdf");
  assert.equal(attachmentTextKind("Invoice.PDF", null), "pdf");
});

test("attachmentTextKind: plain text family", () => {
  assert.equal(attachmentTextKind("notes.txt", "text/plain"), "text");
  assert.equal(attachmentTextKind("rows.csv", null), "text");
  assert.equal(attachmentTextKind(null, "application/json"), "text");
});

test("attachmentTextKind: binaries we can't read yet → null", () => {
  assert.equal(attachmentTextKind("scan.png", "image/png"), null);
  assert.equal(attachmentTextKind("deck.pptx", "application/vnd.ms-powerpoint"), null);
  assert.equal(attachmentTextKind(null, null), null);
});

// --- extractAttachmentText ----------------------------------------------------

test("extractAttachmentText: plain text passes through, capped", async () => {
  const small = await extractAttachmentText(new TextEncoder().encode("  hello world  "), "text");
  assert.equal(small.text, "hello world");
  assert.equal(small.truncated, false);
  assert.equal(small.pages, null);

  const big = await extractAttachmentText(new TextEncoder().encode("x".repeat(MAX_DOC_CHARS + 5)), "text");
  assert.equal(big.text.length, MAX_DOC_CHARS);
  assert.equal(big.truncated, true);
});

test("extractAttachmentText: reads the text layer of a real PDF", async () => {
  const pdf = makePdf(["Invoice INV-77 from Acme for $500", "Payment due 2026-09-01"]);
  const out = await extractAttachmentText(pdf, "pdf");
  assert.equal(out.pages, 2);
  assert.equal(out.truncated, false);
  assert.match(out.text, /Invoice INV-77 from Acme/);
  assert.match(out.text, /due 2026-09-01/);
});

test("extractAttachmentText: unparseable PDF throws (caller degrades to metadata)", async () => {
  await assert.rejects(extractAttachmentText(new TextEncoder().encode("not a pdf"), "pdf"));
});

// --- buildDocumentExtraction ---------------------------------------------------

const ATT: AttachmentMeta = {
  filename: "INV-77.pdf",
  contentType: "application/pdf",
  bytes: 1234,
  blobHash: "abc123",
};

test("metadata-only: document entity + attribute facts, no edges", () => {
  const x = buildDocumentExtraction(ATT, "metadata_only", null);
  assert.equal(x.entities.length, 1);
  const doc = x.entities[0];
  assert.equal(doc.kind, DOCUMENT_KIND);
  assert.equal(doc.label, "INV-77.pdf");
  // Natural key = blob hash + filename → the same file re-forwarded dedupes.
  assert.equal(doc.naturalKeys?.id, "doc:abc123:inv-77.pdf");
  const byPred = new Map(x.facts.map((f) => [f.predicate, f]));
  assert.equal((byPred.get("file_type")?.value as { text: string }).text, "application/pdf");
  assert.equal((byPred.get("file_size")?.value as { num: number }).num, 1234);
  assert.equal((byPred.get("indexed")?.value as { text: string }).text, "metadata_only");
  assert.ok(!x.facts.some((f) => f.predicate === "mentions"));
});

test("missing metadata: no empty facts, label falls back", () => {
  const x = buildDocumentExtraction(
    { filename: null, contentType: null, bytes: 0, blobHash: "h" },
    "metadata_only",
    null,
  );
  assert.equal(x.entities[0].label, "attachment");
  assert.deepEqual(x.facts.map((f) => f.predicate), ["indexed"]);
});

test("with inner extraction: ids re-namespaced + mentions edge per entity", () => {
  const inner: Extraction = {
    entities: [
      { localId: "e1", kind: "org", label: "Acme", naturalKeys: {} },
      { localId: "e2", kind: "invoice", label: "INV-77", naturalKeys: { invoice_no: "INV-77" } },
    ],
    facts: [
      { subjectLocalId: "e2", predicate: "amount", cardinality: "one", value: { kind: "number", num: 500, unit: "USD" } },
      { subjectLocalId: "e2", predicate: "issued_by", cardinality: "one", value: { kind: "entity", entityLocalId: "e1" } },
    ],
  };
  const x = buildDocumentExtraction(ATT, "full", inner);

  assert.deepEqual(x.entities.map((e) => e.localId), ["doc", "d:e1", "d:e2"]);
  const amount = x.facts.find((f) => f.predicate === "amount");
  assert.equal(amount?.subjectLocalId, "d:e2");
  const issued = x.facts.find((f) => f.predicate === "issued_by");
  assert.deepEqual(issued?.value, { kind: "entity", entityLocalId: "d:e1" });

  const mentions = x.facts.filter((f) => f.predicate === "mentions");
  assert.equal(mentions.length, 2);
  for (const m of mentions) {
    assert.equal(m.subjectLocalId, "doc");
    assert.equal(m.cardinality, "many"); // several docs may mention the same thing
  }
  assert.deepEqual(
    mentions.map((m) => (m.value as { entityLocalId: string }).entityLocalId).sort(),
    ["d:e1", "d:e2"],
  );
  assert.equal((x.facts.find((f) => f.predicate === "indexed")?.value as { text: string }).text, "full");
});

test("dangling inner refs are dropped, not folded", () => {
  const inner: Extraction = {
    entities: [{ localId: "e1", kind: "org", label: "Acme", naturalKeys: {} }],
    facts: [
      { subjectLocalId: "ghost", predicate: "amount", cardinality: "one", value: { kind: "number", num: 1 } },
      { subjectLocalId: "e1", predicate: "partner_of", cardinality: "one", value: { kind: "entity", entityLocalId: "ghost" } },
      { subjectLocalId: "e1", predicate: "industry", cardinality: "one", value: { kind: "text", text: "Software" } },
    ],
  };
  const x = buildDocumentExtraction(ATT, "partial", inner);
  assert.ok(!x.facts.some((f) => f.predicate === "amount"));
  assert.ok(!x.facts.some((f) => f.predicate === "partner_of"));
  assert.ok(x.facts.some((f) => f.predicate === "industry" && f.subjectLocalId === "d:e1"));
});
