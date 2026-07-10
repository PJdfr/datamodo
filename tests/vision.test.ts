// Unit tests for the vision tier's pure parts: the image gate
// (document-extraction.ts) and the single-call image prompt (ontology.ts).
// The LLM call itself shares the verified chatJSON contract. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentImageType, MAX_IMAGE_BYTES } from "../lib/datamodo/document-extraction.ts";
import { DEFAULT_KINDS, buildImagePrompt } from "../lib/datamodo/ontology.ts";

test("attachmentImageType: content-type wins, charset suffix tolerated", () => {
  assert.equal(attachmentImageType("photo", "image/png"), "image/png");
  assert.equal(attachmentImageType(null, "image/jpeg; charset=binary"), "image/jpeg");
  assert.equal(attachmentImageType("x.bin", "image/webp"), "image/webp");
});

test("attachmentImageType: extension fallback when content-type is useless", () => {
  assert.equal(attachmentImageType("receipt.JPG", "application/octet-stream"), "image/jpeg");
  assert.equal(attachmentImageType("scan.png", null), "image/png");
  assert.equal(attachmentImageType("anim.gif", ""), "image/gif");
});

test("attachmentImageType: non-images stay null (pdf keeps its own path)", () => {
  assert.equal(attachmentImageType("doc.pdf", "application/pdf"), null);
  assert.equal(attachmentImageType("notes.txt", "text/plain"), null);
  assert.equal(attachmentImageType("archive.zip", "application/zip"), null);
  assert.equal(attachmentImageType(null, null), null);
  // TIFF/BMP are NOT accepted by vision APIs — must not slip through.
  assert.equal(attachmentImageType("scan.tiff", "image/tiff"), null);
});

test("MAX_IMAGE_BYTES stays under provider caps with base64 overhead", () => {
  // base64 inflates 4/3; the padded payload must stay below ~5 MB.
  assert.ok((MAX_IMAGE_BYTES * 4) / 3 < 5_000_000);
});

test("buildImagePrompt: category menu + single-call classify instruction", () => {
  const p = buildImagePrompt({ filename: "receipt.jpg", kinds: DEFAULT_KINDS, concepts: ["vendor consolidation"] });
  assert.match(p, /invoice/i, "category menu present");
  assert.match(p, /First decide which ONE category/, "classify-in-one-call instruction");
  assert.match(p, /photographed receipt IS an invoice/);
  assert.match(p, /existing CONCEPTS \(topics\): vendor consolidation/);
  assert.match(p, /Filename: receipt\.jpg/);
  assert.match(p, /The image is attached\.$/);
  assert.doesNotMatch(p, /Document text:/, "no text section — the image IS the content");
});

test("buildImagePrompt: minimal input degrades gracefully", () => {
  const p = buildImagePrompt({});
  assert.equal(p, "The image is attached.");
});
