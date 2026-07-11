// Unit tests for the Obsidian-flavored markdown parser (lib/datamodo/markdown.ts):
// the pure AST side of node-page bodies. The React renderer maps this AST to
// elements (never HTML), so parse correctness IS the injection-safety story.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInline,
  parseMarkdown,
  safeLinkHref,
  safeMediaSrc,
  type MdBlock,
  type MdInline,
} from "../lib/datamodo/markdown.ts";

const b = (md: string) => parseMarkdown(md);

test("inline: the everyday set nests and coexists", () => {
  const out = parseInline("**bold _in em_** and ~~gone~~ and ==hot== plus `x = y**2`");
  assert.equal(out[0].t, "strong");
  const strong = out[0] as Extract<MdInline, { t: "strong" }>;
  assert.equal(strong.children[1].t, "em");
  assert.deepEqual(out.map((n) => n.t), ["strong", "text", "del", "text", "mark", "text", "code"]);
  assert.equal((out[6] as Extract<MdInline, { t: "code" }>).text, "x = y**2");
});

test("inline: wikilinks, aliases, embeds", () => {
  const out = parseInline("see [[Acme Group]] and [[INV-4417|the invoice]] and ![[receipt.jpg]]");
  const links = out.filter((n) => n.t === "wikilink") as Extract<MdInline, { t: "wikilink" }>[];
  assert.equal(links.length, 3);
  assert.deepEqual(links[0], { t: "wikilink", target: "Acme Group", alias: null, embed: false });
  assert.deepEqual(links[1], { t: "wikilink", target: "INV-4417", alias: "the invoice", embed: false });
  assert.deepEqual(links[2], { t: "wikilink", target: "receipt.jpg", alias: null, embed: true });
});

test("inline: links and images keep their urls; math is greedy-safe", () => {
  const out = parseInline("![scan](/api/documents/d1?inline=1) and [docs](https://x.dev) cost $17,650 and $E=mc^2$");
  assert.deepEqual(out[0], { t: "image", src: "/api/documents/d1?inline=1", alt: "scan" });
  const link = out[2] as Extract<MdInline, { t: "link" }>;
  assert.equal(link.href, "https://x.dev");
  // "$17,650 and $" must NOT parse as math (the $ before a digit is money)…
  const math = out.filter((n) => n.t === "math") as Extract<MdInline, { t: "math" }>[];
  assert.equal(math.length, 1);
  // …while the real formula does.
  assert.equal(math[0].tex, "E=mc^2");
});

test("inline: snake_case never italicizes; escapes survive literally", () => {
  const out = parseInline("the file_type field");
  assert.deepEqual(out, [{ t: "text", text: "the file_type field" }]);
  const esc = parseInline("literal \\*stars\\* and \\[\\[not a link\\]\\]");
  assert.deepEqual(esc, [{ t: "text", text: "literal *stars* and [[not a link]]" }]);
});

test("blocks: headings, quote nesting, hr, fenced code", () => {
  const out = b("## Title\n\n> quoted **deep**\n> > deeper\n\n---\n\n```js\nconst a = 1;\n```");
  assert.deepEqual(out.map((x) => x.t), ["heading", "quote", "hr", "codeblock"]);
  const q = out[1] as Extract<MdBlock, { t: "quote" }>;
  assert.equal(q.children[1].t, "quote");
  const code = out[3] as Extract<MdBlock, { t: "codeblock" }>;
  assert.equal(code.lang, "js");
  assert.equal(code.code, "const a = 1;");
});

test("blocks: tables with alignment and escaped pipes", () => {
  const out = b("| Col | Amount |\n|:---|---:|\n| a \\| b | **12** |");
  const t = out[0] as Extract<MdBlock, { t: "table" }>;
  assert.equal(t.t, "table");
  assert.deepEqual(t.align, ["left", "right"]);
  assert.equal((t.rows[0][0][0] as Extract<MdInline, { t: "text" }>).text, "a | b");
  assert.equal(t.rows[0][1][0].t, "strong");
});

test("blocks: task lists and indent nesting", () => {
  const out = b("- [x] done thing\n- [ ] open thing\n  - nested bullet\n- plain");
  const l = out[0] as Extract<MdBlock, { t: "list" }>;
  assert.equal(l.items.length, 3);
  assert.equal(l.items[0].checked, true);
  assert.equal(l.items[1].checked, false);
  assert.equal(l.items[2].checked, null);
  const sub = l.items[1].sub[0] as Extract<MdBlock, { t: "list" }>;
  assert.equal(sub.t, "list");
  assert.equal(sub.items.length, 1);
});

test("blocks: math blocks in both spellings", () => {
  const out = b("$$\n\\int_0^1 x\\,dx\n$$\n\n$$e^{i\\pi}+1=0$$");
  assert.deepEqual(out.map((x) => x.t), ["mathblock", "mathblock"]);
  assert.match((out[0] as Extract<MdBlock, { t: "mathblock" }>).tex, /int_0\^1/);
});

test("blocks: a table straight after a paragraph still parses", () => {
  const out = b("Here it is:\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.deepEqual(out.map((x) => x.t), ["para", "table"]);
});

test("safety gates: only our paths, https, mailto pass", () => {
  assert.equal(safeMediaSrc("/api/documents/d1?inline=1"), "/api/documents/d1?inline=1");
  assert.equal(safeMediaSrc("https://example.com/x.png"), "https://example.com/x.png");
  assert.equal(safeMediaSrc("javascript:alert(1)"), null);
  assert.equal(safeMediaSrc("data:image/png;base64,AAAA"), null);
  assert.equal(safeMediaSrc("//evil.com/x.png"), null);
  assert.equal(safeMediaSrc("http://insecure.com/x.png"), null);
  assert.equal(safeLinkHref("mailto:sam@acme.com"), "mailto:sam@acme.com");
  assert.equal(safeLinkHref("http://ok-for-links.com"), "http://ok-for-links.com");
  assert.equal(safeLinkHref("javascript:alert(1)"), null);
});
