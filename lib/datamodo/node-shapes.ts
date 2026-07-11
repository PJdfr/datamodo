// NODE SHAPES, phase 2 (pure core, no DB access) — helpers that decide what a
// node's NATURAL SHAPE is beyond record/page (MEMORY.md north star: a node can
// be anything):
// - an IMAGE document renders its image (the original is already streamable
//   at /api/documents/[id]);
// - a BOOKMARK renders as a link card (its `url` fact is the payload);
// - a DATASET appears as a walkable node whose neighbors are the entities
//   projected into its rows — the vault stays canonical, the dataset node is
//   a virtual projection built here, never stored.

import type { KnowledgeEntityView, KnowledgeFactView } from "./types";

// Same media-type gates the ingest pipeline uses (document-extraction.ts);
// duplicated as data, not imported — pure cores stay import-free so node:test
// can strip-types-load them (MEMORY.md convention).
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

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

/** The image media type of a document node, or null when it isn't an image.
 *  Reads the same signals the ingest gate used: the filename inside the
 *  natural key ("doc:<hash>:<filename>") and the `file_type` fact. */
export function entityImageType(e: KnowledgeEntityView): string | null {
  if (e.kind !== "document") return null;
  const key = e.naturalKeys?.id ?? "";
  const filename = /^doc:[^:]+:(.+)$/.exec(key)?.[1] ?? "";
  const contentType = e.facts.find((f) => f.predicate === "file_type" && !f.ref)?.value ?? "";
  const ct = contentType.toLowerCase().split(";")[0].trim();
  if (Object.values(IMAGE_TYPES).includes(ct)) return ct;
  const ext = /\.([a-z0-9]+)$/.exec(filename.toLowerCase())?.[1];
  return (ext && IMAGE_TYPES[ext]) || null;
}

/** The audio media type of a document node, or null when it isn't audio —
 *  same signals as entityImageType. An audio node's natural shape is a PLAYER
 *  (the original streams inline) + the TRANSCRIPT (in body_md). */
export function entityAudioType(e: KnowledgeEntityView): string | null {
  if (e.kind !== "document") return null;
  const key = e.naturalKeys?.id ?? "";
  const filename = /^doc:[^:]+:(.+)$/.exec(key)?.[1] ?? "";
  const contentType = e.facts.find((f) => f.predicate === "file_type" && !f.ref)?.value ?? "";
  const ct = contentType.toLowerCase().split(";")[0].trim();
  const ext = /\.([a-z0-9]+)$/.exec(filename.toLowerCase())?.[1];
  if (ext && AUDIO_TYPES[ext]) return AUDIO_TYPES[ext];
  if (Object.values(AUDIO_TYPES).includes(ct)) return ct;
  if (ct.startsWith("audio/")) return ct;
  return null;
}

/** The http(s) URL behind a bookmark node — from its `url` fact, falling back
 *  to the label itself when the label IS the URL. Null when absent/unsafe
 *  (anything that isn't plain http(s) never becomes a link). */
export function entityBookmarkUrl(e: KnowledgeEntityView): string | null {
  if (e.kind !== "bookmark") return null;
  const raw = (e.facts.find((f) => f.predicate === "url" && !f.ref)?.value ?? e.label).trim();
  return /^https?:\/\/\S+$/i.test(raw) ? raw : null;
}

// --- Dataset-as-node ----------------------------------------------------------

export const DATASET_NODE_PREFIX = "dataset:";
export const DATASET_NODE_KIND = "dataset";

export function isDatasetNodeId(id: string): boolean {
  return id.startsWith(DATASET_NODE_PREFIX);
}

/** What the view layer needs to know about a dataset to project it as a node. */
export interface DatasetNodeSource {
  id: string;
  name: string;
  columns: number;
  /** subject_entity_id of each materialized row (nulls already filtered). */
  rowEntityIds: string[];
}

/**
 * Project datasets into VIRTUAL KnowledgeEntityView nodes: each dataset becomes
 * a `dataset` node with a `contains` edge to every entity that projects into one
 * of its rows. Deterministic; datasets with no resolvable row entities are
 * skipped (an empty table isn't walkable). The result is appended to the real
 * entities for the Explorer only — it never enters the vault.
 */
export function buildDatasetNodes(
  datasets: DatasetNodeSource[],
  entities: KnowledgeEntityView[],
): KnowledgeEntityView[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const out: KnowledgeEntityView[] = [];
  for (const d of datasets) {
    const rowIds = [...new Set(d.rowEntityIds)].filter((id) => byId.has(id));
    if (rowIds.length === 0) continue;
    const facts: KnowledgeFactView[] = rowIds.map((id) => ({
      predicate: "contains",
      value: byId.get(id)!.label,
      ref: true,
      refId: id,
      sources: 0,
      provenance: [],
      confidence: 1,
      validFrom: null,
    }));
    out.push({
      id: DATASET_NODE_PREFIX + d.id,
      kind: DATASET_NODE_KIND,
      label: d.name,
      naturalKeys: { rows: String(rowIds.length), columns: String(d.columns) },
      facts,
      edges: rowIds.length,
      bodyMd: null,
      graphPin: null,
    });
  }
  return out;
}
