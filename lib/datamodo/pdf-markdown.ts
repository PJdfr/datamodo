import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Explicit .ts extension so node --experimental-strip-types (the test runner)
// can resolve it — same pattern as lib/llm/index.ts.
import { MAX_DOC_CHARS, type ExtractedDocText } from "./document-extraction.ts";

// PDF → MARKDOWN converter seam (GRAPH_PIPELINE.md P3, phase 1). unpdf's flat
// text layer loses headings, tables, and reading order before the LLM ever
// sees the document; the good converters (Docling, marker, MinerU,
// pymupdf4llm) are Python. Rather than bundle a Python runtime, this module
// shells out to WHATEVER converter the deployment provides:
//
//   PDF_MARKDOWN_COMMAND="docling-serve-cli --to md"      (cloud worker)
//   PDF_MARKDOWN_COMMAND="python3 /opt/pdf2md.py"          (local edition)
//
// Contract: the command gets the PDF's temp-file path appended as its last
// argument and prints MARKDOWN to stdout. Non-zero exit, timeout, or
// near-empty output (a scan) → null, and the caller falls back to the unpdf
// text layer exactly as before — the seam is pure upside. Downstream,
// markdown output flows into section-aligned chunking (chunkDocText) and a
// structure-preserving prompt for free.

const TIMEOUT_MS = Number(process.env.PDF_MARKDOWN_TIMEOUT_MS ?? 45_000);
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
// Below this many non-whitespace chars the "conversion" is noise (likely a
// scan) — report failure so the scanned-PDF vision path can take over.
const MIN_OUTPUT_CHARS = 40;

/** The configured converter argv, or null when the seam is off (default). */
export function pdfMarkdownCommand(): string[] | null {
  const raw = process.env.PDF_MARKDOWN_COMMAND?.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/).filter(Boolean);
  return parts.length ? parts : null;
}

function run(argv: string[], fileArg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], [...argv.slice(1), fileArg], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`converter timed out after ${TIMEOUT_MS}ms`)));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => {
      if (out.length < MAX_OUTPUT_BYTES) out += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString("utf8")).slice(-500); });
    child.on("error", (e) => finish(() => reject(e)));
    child.on("close", (code) =>
      finish(() => (code === 0 ? resolve(out) : reject(new Error(`converter exited ${code}: ${err}`)))),
    );
  });
}

/**
 * Convert one PDF's bytes to markdown via the configured external converter.
 * Null when the seam is unconfigured or anything goes wrong — the caller's
 * unpdf path is the fail-soft. Page lineage is intentionally absent (markdown
 * converters don't emit reliable page markers); section headings replace it
 * in chunk citations.
 */
export async function convertPdfToMarkdown(bytes: Uint8Array): Promise<ExtractedDocText | null> {
  const argv = pdfMarkdownCommand();
  if (!argv) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "dm-pdfmd-"));
    const file = join(dir, "doc.pdf");
    await writeFile(file, bytes);
    const md = (await run(argv, file)).trim();
    if (md.replace(/\s/g, "").length < MIN_OUTPUT_CHARS) return null;
    return {
      text: md.slice(0, MAX_DOC_CHARS),
      truncated: md.length > MAX_DOC_CHARS,
      pages: null,
    };
  } catch (e) {
    console.error("[pdf-markdown] converter failed — falling back to the text layer", e);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
