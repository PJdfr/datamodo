// FOLDER STRUCTURE FROM THE GRAPH — the user describes how they want their
// stuff organized ("by client, contracts separate from invoices") and we
// build a real folder tree out of the graph: true documents keep their
// original file, every other content node exports as cited markdown, and the
// LLM only decides WHERE things go (it sees labels/kinds/links — an
// inventory, not the content). Placement is previewed before any download;
// building the files is deterministic. Pure module (type imports only) —
// unit-tested; the route (app/api/knowledge/folder-export) is the LLM/blob
// shell that zips it up.

import type { KnowledgeEntityView } from "./types";

/* --------------------------------------------------------------------------
 * What can be exported — documents (original file) + nodes with a body.
 * ------------------------------------------------------------------------ */

export interface ExportableNode {
  id: string;
  kind: string;
  label: string;
  /** A stored original exists (document whose natural key carries the blob). */
  hasOriginal: boolean;
  /** Labels of directly linked entities (both directions) — the LLM's filing signal. */
  links: string[];
}

const MAX_LINKS = 8;

export function collectExportables(entities: KnowledgeEntityView[]): ExportableNode[] {
  const incoming = new Map<string, string[]>();
  for (const e of entities) {
    for (const f of e.facts) {
      if (!f.ref || !f.refId) continue;
      if (!incoming.has(f.refId)) incoming.set(f.refId, []);
      incoming.get(f.refId)!.push(e.label);
    }
  }
  return entities
    .filter((e) => e.kind === "document" || (e.bodyMd && e.bodyMd.trim()))
    .map((e) => {
      const out = e.facts.filter((f) => f.ref).map((f) => f.value);
      const links = [...new Set([...out, ...(incoming.get(e.id) ?? [])])].slice(0, MAX_LINKS);
      return {
        id: e.id,
        kind: e.kind,
        label: e.label,
        hasOriginal: /^doc:[^:]+:/.test(e.naturalKeys?.id ?? ""),
        links,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/* --------------------------------------------------------------------------
 * The plan — what the LLM returns, sanitized hard before use.
 * ------------------------------------------------------------------------ */

export interface FolderPlacement {
  id: string;
  /** Folder path, "/"-separated, already sanitized ("clients/acme"). */
  path: string;
}

export interface FolderPlan {
  /** Archive/root name ("acme-workspace"). */
  name: string;
  placements: FolderPlacement[];
}

export function buildFolderPrompt(request: string, nodes: ExportableNode[]): { system: string; user: string } {
  const inventory = nodes
    .map((n) => `- id=${n.id} · ${n.kind} · "${n.label}"${n.links.length ? ` · linked to: ${n.links.join(", ")}` : ""}`)
    .join("\n");
  return {
    system: [
      "You organize a user's documents and notes into a folder structure. You see an INVENTORY (kind, name, what each item is linked to) — not the contents.",
      "Design a folder tree that fits the user's request and place EVERY item in exactly one folder.",
      "Rules:",
      "- Folder paths are '/'-separated, at most 4 levels deep, short lowercase names (e.g. \"clients/acme/2026/invoices\"). Use subfolders where they genuinely help.",
      "- Group by what the request asks for; use the links to decide where an item belongs.",
      "- Place every listed id. Never invent ids.",
      'Respond with ONLY JSON: {"name":"<short archive name>","placements":[{"id":"<id>","path":"<folder/path>"}]}',
    ].join("\n"),
    user: `Request: ${request}\n\nItems:\n${inventory}`,
  };
}

const MAX_DEPTH = 4;
const SEGMENT_MAX = 40;

/** One path segment, filesystem-safe ("Acme Inc!" → "acme-inc"). */
export const safeSegment = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._ -]+/g, " ")
    .trim()
    .replace(/[ ]+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "")
    .slice(0, SEGMENT_MAX);

export function sanitizeFolderPath(raw: string): string {
  const segs = raw
    .split("/")
    .map(safeSegment)
    .filter(Boolean)
    .slice(0, MAX_DEPTH);
  return segs.join("/") || "unsorted";
}

/** Validate the model's plan: known ids only, one folder each, sanitized
 *  paths; anything the model missed lands in "unsorted" — nothing is ever
 *  silently dropped. */
export function parseFolderPlan(raw: unknown, nodes: ExportableNode[]): FolderPlan {
  const o = raw as Record<string, unknown> | null;
  const known = new Set(nodes.map((n) => n.id));
  const placed = new Map<string, string>();
  const list = Array.isArray(o?.placements) ? (o!.placements as Record<string, unknown>[]) : [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const id = typeof p.id === "string" ? p.id : "";
    const path = typeof p.path === "string" ? p.path : "";
    if (!known.has(id) || placed.has(id)) continue; // unknown/duplicate → ignore
    placed.set(id, sanitizeFolderPath(path));
  }
  for (const n of nodes) if (!placed.has(n.id)) placed.set(n.id, "unsorted");
  const name = safeSegment(typeof o?.name === "string" ? o.name : "") || "datamodo-export";
  // Deterministic order: by path, then label order of the inventory.
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const placements = [...placed.entries()]
    .map(([id, path]) => ({ id, path }))
    .sort((a, b) => a.path.localeCompare(b.path) || (order.get(a.id)! - order.get(b.id)!));
  return { name, placements };
}

/* --------------------------------------------------------------------------
 * Plan → files (deterministic).
 * ------------------------------------------------------------------------ */

export interface PlannedFile {
  /** Full path inside the archive, filename included. */
  path: string;
  entityId: string;
  /** "original" = stream the stored file; "markdown" = render the node. */
  mode: "original" | "markdown";
  label: string;
}

/** Filename for a node: originals keep their (sanitized) real name, markdown
 *  nodes get slug.md. Collisions inside one folder get -2, -3… */
export function planFiles(plan: FolderPlan, nodes: ExportableNode[]): PlannedFile[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const used = new Set<string>();
  const files: PlannedFile[] = [];
  for (const p of plan.placements) {
    const n = byId.get(p.id);
    if (!n) continue;
    const mode: PlannedFile["mode"] = n.hasOriginal ? "original" : "markdown";
    let base: string;
    let ext: string;
    if (mode === "original") {
      const m = /^(.*)\.([A-Za-z0-9]{1,8})$/.exec(n.label.trim());
      base = safeSegment(m ? m[1] : n.label) || "document";
      ext = m ? `.${m[2].toLowerCase()}` : "";
    } else {
      base = safeSegment(n.label) || "note";
      ext = ".md";
    }
    let path = `${p.path}/${base}${ext}`;
    let i = 2;
    while (used.has(path)) path = `${p.path}/${base}-${i++}${ext}`;
    used.add(path);
    files.push({ path, entityId: p.id, mode, label: n.label });
  }
  return files;
}

/** The markdown a body-node exports as — the node's page, portable: label,
 *  kind, facts (with corroboration), connections, then the body itself. */
export function renderNodeMarkdown(
  e: KnowledgeEntityView,
  labelOf: (id: string) => string | null,
  generatedOn: string,
): string {
  const pretty = (p: string) => p.replace(/_/g, " ");
  const md: string[] = [`# ${e.label}`, "", `_${e.kind} · exported from your datamodo graph on ${generatedOn}._`];
  const attrs = e.facts.filter((f) => !f.ref);
  if (attrs.length) {
    md.push("", "## Facts", "");
    for (const f of attrs) md.push(`- **${pretty(f.predicate)}**: ${f.value}${f.sources > 1 ? ` _(${f.sources} sources)_` : ""}`);
  }
  const rels = e.facts.filter((f) => f.ref);
  if (rels.length) {
    md.push("", "## Connections", "");
    for (const f of rels) md.push(`- **${pretty(f.predicate)}** → ${f.refId ? labelOf(f.refId) ?? f.value : f.value}`);
  }
  if (e.bodyMd?.trim()) md.push("", "---", "", e.bodyMd.trim());
  md.push("");
  return md.join("\n");
}

/** The archive's root README: the tree as text, so the structure explains
 *  itself outside the app. */
export function renderFolderReadme(plan: FolderPlan, files: PlannedFile[], generatedOn: string): string {
  const byFolder = new Map<string, PlannedFile[]>();
  for (const f of files) {
    const folder = f.path.slice(0, f.path.lastIndexOf("/"));
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(f);
  }
  const md: string[] = [
    `# ${plan.name}`,
    "",
    `_Folder structure derived from your datamodo graph on ${generatedOn} — originals untouched, everything else rendered as markdown._`,
    "",
  ];
  for (const [folder, fs] of [...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    md.push(`- **${folder}/**`);
    for (const f of fs) md.push(`  - ${f.path.slice(folder.length + 1)}`);
  }
  md.push("");
  return md.join("\n");
}
