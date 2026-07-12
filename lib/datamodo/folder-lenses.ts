// FOLDER LENSES — folders are TAGS derived from the graph, deterministically
// (no LLM anywhere). There is no single "right" tree the way a filesystem
// forces: the same documents organize BY CLIENT, BY PROJECT, BY TOPIC, BY
// MONTH, BY TYPE — each lens is a grouping rule over facts the vault already
// holds, so switching trees is instant and a document linked to two clients
// appears in both folders (a folder is membership, not location). Lenses
// stack two levels deep ("client / month"). The zip export mirrors whatever
// tree is on screen. Pure module (type imports only) — unit-tested; the
// Files view renders what this computes.

import type { KnowledgeEntityView } from "./types";

/** A document/note ready for filing, with everything the lenses group by. */
export interface FiledDoc {
  id: string;
  kind: string;
  label: string;
  /** True stored original exists (drives the export's original-vs-md split). */
  hasOriginal: boolean;
  fileType: string | null;
  /** Directly linked entities, BOTH directions — the tag pool. */
  links: { id: string; label: string; kind: string }[];
  /** When it arrived (first provenance timestamp), ISO — the time lens. */
  receivedAt: string | null;
  channel: string | null;
}

export function collectFiledDocs(entities: KnowledgeEntityView[]): FiledDoc[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const incoming = new Map<string, { id: string; label: string; kind: string }[]>();
  for (const e of entities) {
    for (const f of e.facts) {
      if (!f.ref || !f.refId) continue;
      if (!incoming.has(f.refId)) incoming.set(f.refId, []);
      incoming.get(f.refId)!.push({ id: e.id, label: e.label, kind: e.kind });
    }
  }
  return entities
    .filter((e) => e.kind === "document" || e.kind === "note" || (e.bodyMd && e.bodyMd.trim()))
    .map((e) => {
      let fileType: string | null = null;
      let receivedAt: string | null = null;
      let channel: string | null = null;
      const links = new Map<string, { id: string; label: string; kind: string }>();
      for (const f of e.facts) {
        if (f.ref && f.refId) {
          const t = byId.get(f.refId);
          links.set(f.refId, { id: f.refId, label: f.value, kind: t?.kind ?? "thing" });
        } else if (f.predicate === "file_type") fileType = f.value;
        if (!receivedAt && f.provenance.length > 0) {
          receivedAt = f.provenance[0].receivedAt;
          channel = f.provenance[0].channel;
        }
      }
      for (const inc of incoming.get(e.id) ?? []) if (!links.has(inc.id)) links.set(inc.id, inc);
      return {
        id: e.id,
        kind: e.kind,
        label: e.label,
        hasOriginal: /^doc:[^:]+:/.test(e.naturalKeys?.id ?? ""),
        fileType,
        links: [...links.values()].sort((a, b) => a.label.localeCompare(b.label)),
        receivedAt,
        channel,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/* --------------------------------------------------------------------------
 * Lenses — each one maps a doc to the folder name(s) it belongs to.
 * ------------------------------------------------------------------------ */

export type LensKey = "client" | "person" | "project" | "topic" | "month" | "type" | "channel";

export interface LensDef {
  key: LensKey;
  label: string;
}

export const LENSES: LensDef[] = [
  { key: "client", label: "by client" },
  { key: "project", label: "by project" },
  { key: "person", label: "by person" },
  { key: "topic", label: "by topic" },
  { key: "month", label: "by month" },
  { key: "type", label: "by type" },
  { key: "channel", label: "by channel" },
];

const LINK_KINDS: Partial<Record<LensKey, string[]>> = {
  client: ["company", "org", "organization"],
  person: ["person", "people"],
  project: ["project"],
  topic: ["concept"],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const typeName = (d: FiledDoc): string => {
  if (d.kind === "note") return "notes";
  const t = (d.fileType ?? "").toLowerCase();
  if (t.includes("pdf")) return "pdfs";
  if (t.startsWith("image/")) return "images";
  if (t.startsWith("audio/")) return "audio";
  if (t.includes("spreadsheet") || t.includes("excel") || t.includes("csv")) return "sheets";
  if (t.startsWith("text/")) return "text";
  return d.kind === "document" ? "other files" : `${d.kind}s`;
};

/** The folder name(s) a doc lands in under one lens. Multi-valued for link
 *  lenses (a doc about two clients IS in both folders); [] = unfiled. */
export function lensValues(d: FiledDoc, lens: LensKey): string[] {
  switch (lens) {
    case "client":
    case "person":
    case "project":
    case "topic": {
      const kinds = LINK_KINDS[lens]!;
      return [...new Set(d.links.filter((l) => kinds.includes(l.kind.toLowerCase())).map((l) => l.label))];
    }
    case "month": {
      if (!d.receivedAt) return [];
      const dt = new Date(d.receivedAt);
      if (Number.isNaN(dt.getTime())) return [];
      return [`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")} ${MONTHS[dt.getUTCMonth()]}`];
    }
    case "type":
      return [typeName(d)];
    case "channel":
      return d.channel ? [d.channel] : [];
  }
}

/** Which lenses are worth offering for THIS corpus: at least two folders, or
 *  one folder that doesn't swallow everything. Ordered like LENSES. */
export function availableLenses(docs: FiledDoc[]): (LensDef & { folders: number })[] {
  return LENSES.map((l) => {
    const names = new Set<string>();
    for (const d of docs) for (const v of lensValues(d, l.key)) names.add(v);
    return { ...l, folders: names.size };
  }).filter((l) => l.folders >= 2 || (l.folders === 1 && docs.some((d) => lensValues(d, l.key).length === 0)));
}

/* --------------------------------------------------------------------------
 * The tree — one or two lenses stacked; same docs, different shape.
 * ------------------------------------------------------------------------ */

export interface LensFolder {
  name: string;
  /** Full "/"-joined path from the root. */
  path: string;
  docs: FiledDoc[];
  children: LensFolder[];
  /** Docs in this folder INCLUDING children (the count badge). */
  total: number;
}

export const UNFILED = "unfiled";

/** Group docs by the lens stack (1 or 2 levels). Deterministic: folders sort
 *  by size then name; docs are already label-sorted; unfiled sinks last. */
export function buildLensTree(docs: FiledDoc[], stack: LensKey[]): LensFolder[] {
  const level = (list: FiledDoc[], lens: LensKey, base: string): LensFolder[] => {
    const groups = new Map<string, FiledDoc[]>();
    for (const d of list) {
      const values = lensValues(d, lens);
      for (const v of values.length ? values : [UNFILED]) {
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v)!.push(d);
      }
    }
    return [...groups.entries()]
      .sort(
        (a, b) =>
          Number(a[0] === UNFILED) - Number(b[0] === UNFILED) ||
          b[1].length - a[1].length ||
          a[0].localeCompare(b[0]),
      )
      .map(([name, members]) => {
        const path = base ? `${base}/${name}` : name;
        const rest = stack.slice(stack.indexOf(lens) + 1);
        const children = rest.length && members.length > 1 ? level(members, rest[0], path) : [];
        // With children, docs live in the leaves; a single-member group keeps
        // the doc at this level instead of a one-doc subfolder.
        return {
          name,
          path,
          docs: children.length ? [] : members,
          children,
          total: members.length,
        };
      });
  };
  if (stack.length === 0) return [];
  return level(docs, stack[0], "");
}

/** Flatten a lens tree into export placements (entityId → folder path) for
 *  the existing zip route. A doc in N folders is exported N times — folders
 *  are tags, and the zip mirrors exactly what the screen shows. */
export function treeToPlacements(tree: LensFolder[]): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  const walk = (f: LensFolder) => {
    for (const d of f.docs) out.push({ id: d.id, path: f.path });
    f.children.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}
