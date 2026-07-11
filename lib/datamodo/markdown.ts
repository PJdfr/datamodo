// Obsidian-flavored markdown PARSER (pure core, no imports — node:test loads
// it directly). Produces an AST the React renderer (app/dashboard/markdown.tsx)
// maps to elements, so model- or user-authored text can never inject markup:
// nothing here ever emits HTML.
//
// Supported (the Obsidian everyday set):
//   blocks — # headings, paragraphs, > quotes (nested), ``` fenced code,
//            ---/*** rules, -/*/1. lists (nested by indent, - [ ] tasks),
//            | GFM tables |, $$ math blocks
//   inline — **bold**, *italic*, ~~strike~~, ==highlight==, `code`,
//            [text](url), ![alt](url) images, [[wikilinks]] / [[target|alias]],
//            ![[embeds]], $inline math$, \* escapes
//
// Wikilinks/embeds are TARGETS here, not links — the renderer resolves them
// against the user's actual nodes (an unresolved wikilink stays plain text,
// exactly like Obsidian's unresolved links).

export type MdInline =
  | { t: "text"; text: string }
  | { t: "strong"; children: MdInline[] }
  | { t: "em"; children: MdInline[] }
  | { t: "del"; children: MdInline[] }
  | { t: "mark"; children: MdInline[] }
  | { t: "code"; text: string }
  | { t: "link"; href: string; children: MdInline[] }
  | { t: "image"; src: string; alt: string }
  | { t: "wikilink"; target: string; alias: string | null; embed: boolean }
  | { t: "math"; tex: string };

export interface MdListItem {
  /** null = plain bullet; true/false = task checkbox state. */
  checked: boolean | null;
  children: MdInline[];
  /** Nested blocks (sub-lists) under this item. */
  sub: MdBlock[];
}

export type MdBlock =
  | { t: "heading"; level: number; children: MdInline[] }
  | { t: "para"; children: MdInline[] }
  | { t: "quote"; children: MdBlock[] }
  | { t: "codeblock"; lang: string | null; code: string }
  | { t: "hr" }
  | { t: "list"; ordered: boolean; items: MdListItem[] }
  | { t: "table"; header: MdInline[][]; align: ("left" | "center" | "right" | null)[]; rows: MdInline[][][] }
  | { t: "mathblock"; tex: string };

// --- inline parsing --------------------------------------------------------------

// One combined scanner; longest/most-specific tokens first. Escapes are handled
// before the scan so \* etc. survive as literal text.
const INLINE_RE =
  /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|!\[\[([^\][\n]+)\]\]|\[\[([^\][\n]+)\]\]|!\[([^\]\n]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|\*\*([^*\n](?:[^\n]*?[^*\n])?)\*\*|(?<![\w])__([^_\n](?:[^\n]*?[^_\n])?)__(?![\w])|~~([^~\n]+?)~~|==([^=\n]+?)==|\*([^*\s](?:[^*\n]*?[^*\s])?)\*|(?<![\w])_([^_\s](?:[^_\n]*?[^_\s])?)_(?![\w])|\$(?!\s)([^$\n]+?)(?<![\s\\])\$(?!\d)/g;

const ESCAPABLE = new Set(["\\", "`", "*", "_", "[", "]", "(", ")", "#", "+", "-", "!", "|", "$", "~", "="]);
const ESC_MARK = "\u0000"; // impossible in real text — a safe escape placeholder

/** Replace \x escapes with placeholders so the scanner never sees them. */
function protectEscapes(text: string): { s: string; escaped: string[] } {
  const escaped: string[] = [];
  let s = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length && ESCAPABLE.has(text[i + 1])) {
      s += ESC_MARK + escaped.length + ESC_MARK;
      escaped.push(text[i + 1]);
      i++;
    } else {
      s += text[i];
    }
  }
  return { s, escaped };
}

function restoreEscapes(text: string, escaped: string[]): string {
  if (!escaped.length) return text;
  return text.replace(new RegExp(`${ESC_MARK}(\\d+)${ESC_MARK}`, "g"), (_, n) => escaped[Number(n)] ?? "");
}

function parseInlineProtected(s: string, escaped: string[]): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  const pushText = (raw: string) => {
    if (raw) out.push({ t: "text", text: restoreEscapes(raw, escaped) });
  };
  const nested = (raw: string) => parseInlineProtected(raw, escaped);

  // A FRESH regex per invocation: `nested()` recursion would otherwise reset
  // the shared global's lastIndex mid-loop and re-match forever.
  const re = new RegExp(INLINE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    pushText(s.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2] !== undefined) {
      out.push({ t: "code", text: restoreEscapes(m[2].trim(), escaped) });
    } else if (m[3] !== undefined) {
      const [target, alias] = splitWiki(restoreEscapes(m[3], escaped));
      out.push({ t: "wikilink", target, alias, embed: true });
    } else if (m[4] !== undefined) {
      const [target, alias] = splitWiki(restoreEscapes(m[4], escaped));
      out.push({ t: "wikilink", target, alias, embed: false });
    } else if (m[6] !== undefined) {
      out.push({ t: "image", src: restoreEscapes(m[6], escaped), alt: restoreEscapes(m[5] ?? "", escaped) });
    } else if (m[8] !== undefined) {
      out.push({ t: "link", href: restoreEscapes(m[8], escaped), children: nested(m[7] ?? "") });
    } else if (m[9] !== undefined) {
      out.push({ t: "strong", children: nested(m[9]) });
    } else if (m[10] !== undefined) {
      out.push({ t: "strong", children: nested(m[10]) });
    } else if (m[11] !== undefined) {
      out.push({ t: "del", children: nested(m[11]) });
    } else if (m[12] !== undefined) {
      out.push({ t: "mark", children: nested(m[12]) });
    } else if (m[13] !== undefined) {
      out.push({ t: "em", children: nested(m[13]) });
    } else if (m[14] !== undefined) {
      out.push({ t: "em", children: nested(m[14]) });
    } else if (m[15] !== undefined) {
      out.push({ t: "math", tex: restoreEscapes(m[15], escaped) });
    }
  }
  pushText(s.slice(last));
  return out;
}

function splitWiki(inner: string): [string, string | null] {
  const at = inner.indexOf("|");
  if (at === -1) return [inner.trim(), null];
  return [inner.slice(0, at).trim(), inner.slice(at + 1).trim() || null];
}

export function parseInline(text: string): MdInline[] {
  const { s, escaped } = protectEscapes(text);
  return parseInlineProtected(s, escaped);
}

// --- block parsing ---------------------------------------------------------------

const HR_RE = /^ {0,3}((\* *){3,}|(- *){3,}|(_ *){3,})$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;
const TABLE_SEP_RE = /^ {0,3}\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;

function splitRow(line: string): string[] {
  // Split a | row into cells, honoring \| escapes.
  const cells: string[] = [];
  let cur = "";
  let i = 0;
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  while (i < s.length) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i += 2; continue; }
    if (s[i] === "|") { cells.push(cur.trim()); cur = ""; i++; continue; }
    cur += s[i]; i++;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseMarkdown(md: string): MdBlock[] {
  return parseBlocks(md.split(/\r?\n/));
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // fenced code
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const open = fence[1];
      const lang = fence[2] || null;
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(open.slice(0, 3))) { code.push(lines[i]); i++; }
      i++; // closing fence (or EOF)
      // $$ blocks often arrive as ```math too — treat that fence as math
      if (lang === "math" || lang === "latex" || lang === "tex") blocks.push({ t: "mathblock", tex: code.join("\n").trim() });
      else blocks.push({ t: "codeblock", lang, code: code.join("\n") });
      continue;
    }

    // $$ math block ($$ on its own line, or one-liner $$...$$)
    if (/^ {0,3}\$\$/.test(line)) {
      const one = /^ {0,3}\$\$(.+)\$\$\s*$/.exec(line);
      if (one) { blocks.push({ t: "mathblock", tex: one[1].trim() }); i++; continue; }
      const tex: string[] = [];
      const first = line.replace(/^ {0,3}\$\$/, "");
      if (first.trim()) tex.push(first);
      i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) { tex.push(lines[i]); i++; }
      if (i < lines.length) { const tail = lines[i].replace(/\$\$\s*$/, ""); if (tail.trim()) tex.push(tail); i++; }
      blocks.push({ t: "mathblock", tex: tex.join("\n").trim() });
      continue;
    }

    // heading
    const h = HEADING_RE.exec(line);
    if (h) { blocks.push({ t: "heading", level: h[1].length, children: parseInline(h[2]) }); i++; continue; }

    // hr (checked after list so "- - -" is rare; HR_RE requires 3+)
    if (HR_RE.test(line.trim())) { blocks.push({ t: "hr" }); i++; continue; }

    // blockquote — collect the > run, strip one level, recurse
    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) { inner.push(QUOTE_RE.exec(lines[i])![1]); i++; }
      blocks.push({ t: "quote", children: parseBlocks(inner) });
      continue;
    }

    // table — a | row followed by a separator row
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) && lines[i + 1].includes("|")) {
      const header = splitRow(line).map(parseInline);
      const align = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(":"), r = c.endsWith(":");
        return l && r ? ("center" as const) : r ? ("right" as const) : l ? ("left" as const) : null;
      });
      i += 2;
      const rows: MdInline[][][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ t: "table", header, align, rows });
      continue;
    }

    // list — gather the run, then build items with indent nesting
    if (LIST_RE.test(line)) {
      const run: string[] = [];
      while (i < lines.length && (LIST_RE.test(lines[i]) || (lines[i].trim() && /^\s{2,}/.test(lines[i])))) {
        run.push(lines[i]);
        i++;
      }
      blocks.push(parseList(run));
      continue;
    }

    // paragraph — until a blank line or a structural line (incl. a table start)
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !HEADING_RE.test(lines[i]) && !FENCE_RE.test(lines[i]) && !LIST_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) && !HR_RE.test(lines[i].trim()) && !/^ {0,3}\$\$/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && lines[i + 1].includes("|") && TABLE_SEP_RE.test(lines[i + 1]))
    ) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ t: "para", children: parseInline(para.join(" ")) });
    else i++; // structural line will be picked up next loop
  }
  return blocks;
}

function parseList(run: string[]): MdBlock {
  const first = LIST_RE.exec(run[0])!;
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: MdListItem[] = [];
  let k = 0;
  while (k < run.length) {
    const m = LIST_RE.exec(run[k]);
    if (m && m[1].length <= baseIndent) {
      // this level's item
      let body = m[3];
      let checked: boolean | null = null;
      const task = TASK_RE.exec(body);
      if (task) { checked = task[1] !== " "; body = task[2]; }
      // gather deeper lines under this item
      const deeper: string[] = [];
      k++;
      while (k < run.length) {
        const dm = LIST_RE.exec(run[k]);
        if (dm && dm[1].length <= baseIndent) break;
        deeper.push(run[k]);
        k++;
      }
      const sub = deeper.length ? parseBlocks(deeper.map((l) => l.slice(Math.min(baseIndent + 2, l.length - l.trimStart().length)))) : [];
      items.push({ checked, children: parseInline(body), sub });
    } else {
      k++; // stray continuation without a parent — skip defensively
    }
  }
  return { t: "list", ordered, items };
}

// --- render-side guards (pure, shared with the component) --------------------------

/** Image/link sources the renderer will actually load: our own app paths and
 *  https. Everything else (javascript:, data:, http:) renders as plain text. */
export function safeMediaSrc(src: string): string | null {
  const s = src.trim();
  if (/^\/(?!\/)/.test(s)) return s; // root-relative (e.g. /api/documents/…)
  if (/^https:\/\/\S+$/i.test(s)) return s;
  return null;
}

export function safeLinkHref(href: string): string | null {
  const s = href.trim();
  if (/^\/(?!\/)/.test(s)) return s;
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^mailto:[^\s]+$/i.test(s)) return s;
  return null;
}
