import type { Extraction, ExtractedFact } from "./knowledge";

// OBSIDIAN VAULT IMPORT pure core (user ask 2026-07-16) — deterministic,
// ZERO-LLM mapping from a vault's .md files to datamodo extractions:
//   note → `note` entity, body_md = the note (wikilinks already render live)
//   [[wikilink]] → `mentions` edge (unresolved targets become note stubs)
//   frontmatter key: value → fact (number/date/text typed; [[X]] → edge)
//   #tags + frontmatter tags → concept entities (`about` edges)
//   aliases: → also_known_as facts (feeds trigram resolution)
// Identity = the note's BASENAME (what wikilinks address), so stubs and the
// real note converge on one node and re-imports hit tier-0 dedup. Pure: no
// fs, no Prisma — runs in the browser (folder picker) and the CLI alike.
// Tests: tests/obsidian-import.test.ts.

export interface VaultFile {
  /** Vault-relative path, e.g. "Books/Dune.md". */
  path: string;
  content: string;
}

export interface ParsedNote {
  path: string;
  /** The basename (sans .md) — the identity wikilinks address. */
  name: string;
  title: string;
  body: string;
  props: Record<string, unknown>;
  tags: string[];
  aliases: string[];
  links: string[];
}

/** Frontmatter keys that are Obsidian plumbing, never facts. */
const RESERVED_PROPS = new Set(["title", "tags", "aliases", "cssclass", "cssclasses", "publish", "permalink", "position"]);

const WIKILINK = /(?<!!)\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const INLINE_TAG = /(^|[\s(])#([A-Za-z][\w/-]*)/g;

function parseScalar(raw: string): unknown {
  const s = raw.trim().replace(/^["']|["']$/g, "");
  if (s === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === "true";
  return s;
}

/** Minimal YAML-subset frontmatter parser: scalars, inline lists [a, b],
 *  block lists (- item), quoted strings, wikilink values. Unparseable lines
 *  are skipped — conservative by design. */
export function parseFrontmatter(content: string): { props: Record<string, unknown>; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { props: {}, body: content };
  const props: Record<string, unknown> = {};
  let currentKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const list = line.match(/^\s+-\s*(.+)$/);
    if (list && currentKey) {
      const arr = (props[currentKey] as unknown[] | undefined) ?? [];
      props[currentKey] = [...arr, parseScalar(list[1])];
      continue;
    }
    const kv = line.match(/^([A-Za-z][\w -]*?):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const raw = kv[2].trim();
    currentKey = key;
    if (raw === "") { props[key] = []; continue; } // block list follows (or empty)
    if (raw.startsWith("[") && raw.endsWith("]")) {
      props[key] = raw.slice(1, -1).split(",").map((x) => parseScalar(x)).filter((x) => x !== "");
    } else {
      props[key] = parseScalar(raw);
      currentKey = null;
    }
  }
  return { props, body: content.slice(m[0].length) };
}

export function parseNote(file: VaultFile): ParsedNote {
  const { props, body } = parseFrontmatter(file.content);
  const name = (file.path.split("/").pop() ?? file.path).replace(/\.md$/i, "");
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = (typeof props.title === "string" && props.title.trim()) || h1 || name;
  const links = [...new Set([...body.matchAll(WIKILINK)].map((x) => x[1].trim()).filter(Boolean))].filter(
    (t) => t.toLowerCase() !== name.toLowerCase(),
  );
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",").map((s) => s.trim()) : [];
  const tags = [
    ...new Set([
      ...asList(props.tags).map((t) => t.replace(/^#/, "")),
      ...[...body.matchAll(INLINE_TAG)].map((x) => x[2]),
    ]),
  ].map((t) => t.replace(/\//g, " ").trim()).filter(Boolean);
  return { path: file.path, name, title, body, props, tags, aliases: asList(props.aliases), links };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** One note → one Extraction (the contract ingestExtraction consumes). */
export function noteToExtraction(note: ParsedNote): Extraction {
  const entities: Extraction["entities"] = [{ localId: "e1", kind: "note", label: note.name, naturalKeys: {} }];
  const facts: ExtractedFact[] = [];
  const localFor = new Map<string, string>();
  const entityFor = (label: string, kind: string): string => {
    const key = `${kind}::${label.toLowerCase()}`;
    let id = localFor.get(key);
    if (!id) {
      id = `e${entities.length + 1}`;
      localFor.set(key, id);
      entities.push({ localId: id, kind, label, naturalKeys: {} });
    }
    return id;
  };

  if (note.title !== note.name) {
    facts.push({ subjectLocalId: "e1", predicate: "title", cardinality: "one", value: { kind: "text", text: note.title } });
  }
  const single = (v: unknown): ExtractedFact["value"] | null => {
    if (typeof v === "number") return { kind: "number", num: v };
    if (typeof v === "boolean") return { kind: "text", text: String(v) };
    if (typeof v === "string") {
      const wl = v.match(/^\[\[([^\]|#^]+)/);
      if (wl) return { kind: "entity", entityLocalId: entityFor(wl[1].trim(), "note") };
      if (isIsoDate(v)) return { kind: "date", date: v };
      return v.trim() ? { kind: "text", text: v } : null;
    }
    return null;
  };
  for (const [key, v] of Object.entries(note.props)) {
    if (RESERVED_PROPS.has(key.toLowerCase())) continue;
    const predicate = slug(key);
    if (!predicate) continue;
    const values = Array.isArray(v) ? v : [v];
    for (const one of values) {
      const value = single(one);
      if (value) facts.push({ subjectLocalId: "e1", predicate, cardinality: values.length > 1 ? "many" : "one", value });
    }
  }
  for (const alias of note.aliases) {
    if (alias.trim()) facts.push({ subjectLocalId: "e1", predicate: "also_known_as", cardinality: "many", value: { kind: "text", text: alias.trim() } });
  }
  for (const tag of note.tags) {
    facts.push({ subjectLocalId: "e1", predicate: "about", cardinality: "many", value: { kind: "entity", entityLocalId: entityFor(tag, "concept") } });
  }
  for (const target of note.links) {
    facts.push({ subjectLocalId: "e1", predicate: "mentions", cardinality: "many", value: { kind: "entity", entityLocalId: entityFor(target, "note") } });
  }
  return { entities, facts };
}

export interface FolderShape {
  folder: string;
  notes: number;
  /** Frontmatter keys ≥60% of the folder's notes share — a template announcing itself. */
  sharedKeys: string[];
}

export interface VaultPlan {
  notes: ParsedNote[];
  stats: { notes: number; links: number; tags: number; propFacts: number; folders: number };
  /** Folders whose notes share a frontmatter shape (≥3 notes, ≥2 shared keys). */
  folderShapes: FolderShape[];
}

/** Parse a whole vault (markdown files only) into the import plan. */
export function planVault(files: VaultFile[]): VaultPlan {
  const notes = files.filter((f) => /\.md$/i.test(f.path)).map(parseNote);
  const byFolder = new Map<string, ParsedNote[]>();
  let links = 0, propFacts = 0;
  const tagSet = new Set<string>();
  for (const n of notes) {
    links += n.links.length;
    n.tags.forEach((t) => tagSet.add(t.toLowerCase()));
    propFacts += Object.keys(n.props).filter((k) => !RESERVED_PROPS.has(k.toLowerCase())).length;
    const folder = n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "";
    if (folder) byFolder.set(folder, [...(byFolder.get(folder) ?? []), n]);
  }
  const folderShapes: FolderShape[] = [];
  for (const [folder, group] of byFolder) {
    if (group.length < 3) continue;
    const counts = new Map<string, number>();
    for (const n of group) {
      for (const k of Object.keys(n.props)) {
        if (!RESERVED_PROPS.has(k.toLowerCase())) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    const shared = [...counts.entries()].filter(([, c]) => c >= group.length * 0.6).map(([k]) => k);
    if (shared.length >= 2) folderShapes.push({ folder, notes: group.length, sharedKeys: shared.sort() });
  }
  return {
    notes,
    stats: { notes: notes.length, links, tags: tagSet.size, propFacts, folders: byFolder.size },
    folderShapes,
  };
}
