// Tests for GRAPH_PIPELINE.md P3 phase 1: the PDF→markdown converter seam
// (lib/datamodo/pdf-markdown.ts, driven via fake converter scripts) and the
// section-aligned markdown chunking (document-extraction.ts pure core).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { convertPdfToMarkdown, pdfMarkdownCommand } from "../lib/datamodo/pdf-markdown.ts";
import { chunkDocText, looksLikeMarkdown, CHUNK_SIZE } from "../lib/datamodo/document-extraction.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const BYTES = new Uint8Array(Buffer.from("%PDF-fake"));

test("pdfMarkdownCommand: unset env = seam off", () => {
  delete process.env.PDF_MARKDOWN_COMMAND;
  assert.equal(pdfMarkdownCommand(), null);
  process.env.PDF_MARKDOWN_COMMAND = "  ";
  assert.equal(pdfMarkdownCommand(), null);
  process.env.PDF_MARKDOWN_COMMAND = "python3 /opt/pdf2md.py --fast";
  assert.deepEqual(pdfMarkdownCommand(), ["python3", "/opt/pdf2md.py", "--fast"]);
  delete process.env.PDF_MARKDOWN_COMMAND;
});

test("convertPdfToMarkdown: happy path returns the converter's markdown", async () => {
  process.env.PDF_MARKDOWN_COMMAND = `${process.execPath} ${join(fixtures, "fake-pdf-md.mjs")}`;
  try {
    const doc = await convertPdfToMarkdown(BYTES);
    assert.ok(doc);
    assert.match(doc.text, /^# Invoice INV-9/);
    assert.match(doc.text, /## Payment/);
    assert.equal(doc.truncated, false);
    assert.equal(doc.pages, null);
  } finally {
    delete process.env.PDF_MARKDOWN_COMMAND;
  }
});

test("convertPdfToMarkdown: failing converter → null (fail-soft), off seam → null", async () => {
  process.env.PDF_MARKDOWN_COMMAND = `${process.execPath} ${join(fixtures, "fake-pdf-md-fail.mjs")}`;
  try {
    assert.equal(await convertPdfToMarkdown(BYTES), null);
  } finally {
    delete process.env.PDF_MARKDOWN_COMMAND;
  }
  assert.equal(await convertPdfToMarkdown(BYTES), null); // seam off
});

test("looksLikeMarkdown: needs real headings, not stray hashes", () => {
  assert.equal(looksLikeMarkdown("# One\n\ntext\n\n## Two\n\nmore"), true);
  assert.equal(looksLikeMarkdown("# Only one heading\n\ntext"), false);
  assert.equal(looksLikeMarkdown("issue #12 and #13 are open"), false);
  assert.equal(looksLikeMarkdown("plain paragraphs\n\nno structure"), false);
});

test("chunkDocText: markdown chunks per section, heading carried on every piece", () => {
  const body = "sentence. ".repeat(Math.ceil(CHUNK_SIZE / 10) + 20); // > one chunk
  const doc = {
    text: `preamble before any heading\n\n# Alpha\n\n${body}\n\n## Beta\n\nshort beta body`,
    truncated: false,
    pages: null,
  };
  const chunks = chunkDocText(doc);
  assert.ok(chunks.length >= 4, `expected >=4 chunks, got ${chunks.length}`);
  assert.equal(chunks[0].text, "preamble before any heading"); // no fake heading
  const alpha = chunks.filter((c) => c.text.startsWith("# Alpha"));
  assert.ok(alpha.length >= 2, "long section splits into several heading-prefixed chunks");
  assert.equal(chunks.at(-1)!.text, "## Beta\n\nshort beta body");
  assert.ok(chunks.every((c) => c.page === null));
});

test("chunkDocText: page lineage still wins when pageTexts exist", () => {
  const doc = {
    text: "# H1\n\nx\n\n# H2\n\ny",
    truncated: false,
    pages: 2,
    pageTexts: [
      { page: 1, text: "# H1\n\nx" },
      { page: 2, text: "# H2\n\ny" },
    ],
  };
  const chunks = chunkDocText(doc);
  assert.deepEqual(chunks.map((c) => c.page), [1, 2]);
});
