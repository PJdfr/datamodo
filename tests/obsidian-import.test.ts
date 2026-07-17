// Tests for the Obsidian vault import pure core
// (lib/datamodo/obsidian-import.ts): frontmatter, wikilinks, tags, the
// note→extraction mapping, and folder-shape detection.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, parseNote, noteToExtraction, planVault } from "../lib/datamodo/obsidian-import.ts";

const DUNE = `---
title: "Dune"
author: "[[Frank Herbert]]"
rating: 4.5
read: 2026-01-02
status: reading
tags: [book, scifi]
aliases:
  - The Dune Book
---
# Dune

A [[Paul Atreides]] story on [[Arrakis]]. See also [[Dune|the classic]].
Not a link: ![[cover.png]]. Inline #sf/space-opera tag, but not a #1 heading.
`;

test("parseFrontmatter: scalars, quoted strings, inline + block lists", () => {
  const { props, body } = parseFrontmatter(DUNE);
  assert.equal(props.title, "Dune");
  assert.equal(props.rating, 4.5);
  assert.equal(props.status, "reading");
  assert.deepEqual(props.tags, ["book", "scifi"]);
  assert.deepEqual(props.aliases, ["The Dune Book"]);
  assert.match(body, /^# Dune/);
  // No frontmatter → whole content is body.
  assert.deepEqual(parseFrontmatter("just text").props, {});
});

test("parseNote: name/title/links/tags — embeds and self-links excluded", () => {
  const n = parseNote({ path: "Books/Dune.md", content: DUNE });
  assert.equal(n.name, "Dune");
  assert.equal(n.title, "Dune");
  assert.deepEqual(n.links, ["Paul Atreides", "Arrakis"]); // no embed, no self-link
  assert.ok(n.tags.includes("book"));
  assert.ok(n.tags.includes("sf space-opera")); // nested tag flattened
  assert.ok(!n.tags.includes("1")); // "#1" is not a tag
  assert.deepEqual(n.aliases, ["The Dune Book"]);
});

test("noteToExtraction: note entity + typed facts + edges + concepts", () => {
  const x = noteToExtraction(parseNote({ path: "Books/Dune.md", content: DUNE }));
  const e1 = x.entities[0];
  assert.equal(e1.kind, "note");
  assert.equal(e1.label, "Dune");
  const byPred = (p: string) => x.facts.filter((f) => f.predicate === p);
  assert.deepEqual(byPred("rating")[0].value, { kind: "number", num: 4.5 });
  assert.deepEqual(byPred("read")[0].value, { kind: "date", date: "2026-01-02" });
  assert.deepEqual(byPred("status")[0].value, { kind: "text", text: "reading" });
  // Wikilink property → edge to a note stub.
  const author = byPred("author")[0].value;
  assert.equal(author.kind, "entity");
  const herbert = x.entities.find((e) => e.label === "Frank Herbert");
  assert.equal(herbert?.kind, "note");
  // Tags → concept entities via `about`; links → `mentions`.
  assert.equal(byPred("about").length, 3);
  assert.ok(x.entities.some((e) => e.kind === "concept" && e.label === "book"));
  assert.equal(byPred("mentions").length, 2);
  assert.equal(byPred("also_known_as")[0].cardinality, "many");
  // Every fact's localIds resolve.
  const ids = new Set(x.entities.map((e) => e.localId));
  for (const f of x.facts) {
    assert.ok(ids.has(f.subjectLocalId));
    if (f.value.kind === "entity") assert.ok(ids.has(f.value.entityLocalId));
  }
});

test("planVault: stats + folder shapes (≥3 notes sharing ≥2 keys)", () => {
  const book = (name: string) => ({
    path: `Books/${name}.md`,
    content: `---\nauthor: "[[A]]"\nrating: 3\n---\ntext [[Other]]`,
  });
  const plan = planVault([
    book("One"), book("Two"), book("Three"),
    { path: "Daily/2026-07-16.md", content: "did things #log" },
    { path: "vault.canvas", content: "{}" }, // non-md ignored
  ]);
  assert.equal(plan.stats.notes, 4);
  assert.equal(plan.stats.links, 3);
  assert.deepEqual(plan.folderShapes, [{ folder: "Books", notes: 3, sharedKeys: ["author", "rating"] }]);
});
