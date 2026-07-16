// LOCAL EDITION first-run sizing — PURE core. Maps a RAM budget to a local
// model tier (which Ollama models to pull for text extraction, vision/scanned
// PDFs, and embeddings). No I/O here: RAM detection, prompts and pulls live in
// setup.mjs; this stays unit-testable.
//
// The tier table is the product decision (design/briefs/local-packaging-brief.md §5):
// models must fit the machine or extraction is swap-death slow; the wizard only
// SEEDS ~/.datamodo/llm.json — everything stays editable from the dashboard.

/** @typedef {{ name: string, minGb: number, text: string, vision: string|null, embed: string, note: string }} ModelTier */

/** Ordered smallest → largest; `pickTier` returns the largest tier whose
 *  minGb fits the budget. */
export const MODEL_TIERS = [
  {
    name: "tiny",
    minGb: 0,
    text: "llama3.2:3b",
    vision: null, // no vision model fits comfortably next to a 3B — scanned PDFs/images stay metadata-only
    embed: "nomic-embed-text",
    note: "Extraction quality is limited on a 3B model — expect more review queue. Images and scanned PDFs are filed without reading (no vision model at this size).",
  },
  {
    name: "standard",
    minGb: 6.5,
    text: "llama3.1:8b",
    vision: "llava",
    embed: "nomic-embed-text",
    note: "The sensible default — 8B text extraction plus LLaVA for images and scanned PDFs.",
  },
  {
    name: "plus",
    minGb: 14,
    text: "llama3.1:8b",
    vision: "llama3.2-vision",
    embed: "nomic-embed-text",
    note: "8B text extraction with the stronger llama3.2-vision for images and scanned PDFs.",
  },
  {
    name: "max",
    minGb: 28,
    text: "qwen2.5:14b",
    vision: "llama3.2-vision",
    embed: "nomic-embed-text",
    note: "A 14B extraction model — noticeably better structured output — plus llama3.2-vision.",
  },
];

/** The largest tier that fits `ramGb`. Anything falsy/invalid gets the
 *  smallest tier (never crash the wizard on a weird cgroup value). */
export function pickTier(ramGb) {
  const gb = Number(ramGb);
  if (!Number.isFinite(gb) || gb <= 0) return MODEL_TIERS[0];
  let best = MODEL_TIERS[0];
  for (const t of MODEL_TIERS) if (gb >= t.minGb) best = t;
  return best;
}

/** The distinct models a tier needs pulled (text + vision + embeddings). */
export function tierModels(tier) {
  return [...new Set([tier.text, tier.vision, tier.embed].filter(Boolean))];
}

/** Parse a cgroup memory limit file's content into bytes, or null when
 *  unlimited/absent ("max", huge sentinel values, garbage). */
export function parseCgroupLimit(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s === "max") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  // cgroup v1 reports "no limit" as a huge page-rounded number (~2^63).
  if (n >= 2 ** 60) return null;
  return n;
}

/** Effective RAM budget in GB given total system memory and an optional
 *  container (cgroup) limit — the smaller wins. Rounded to one decimal. */
export function effectiveRamGb(totalBytes, cgroupLimitBytes) {
  const candidates = [totalBytes, cgroupLimitBytes].filter((v) => Number.isFinite(v) && v > 0);
  if (!candidates.length) return 0;
  return Math.round((Math.min(...candidates) / 1024 ** 3) * 10) / 10;
}
