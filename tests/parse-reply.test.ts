// The parse-summary reply: what the agent answers when pinged directly.
// Pure text building + the ping gate. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildParseReply, shouldSendParseReply } from "../lib/datamodo/parse-reply.ts";
import type { Extraction } from "../lib/datamodo/knowledge";

const richExtraction: Extraction = {
  entities: [
    { localId: "e1", kind: "invoice", label: "INV-777", naturalKeys: { invoice_no: "INV-777" } },
    { localId: "e2", kind: "company", label: "Initech Corp" },
    { localId: "e3", kind: "person", label: "Sarah Connor" },
    { localId: "c1", kind: "concept", label: "procurement" },
  ],
  facts: [
    { subjectLocalId: "e1", predicate: "amount", cardinality: "one", value: { kind: "number", num: 250, unit: "USD" } },
    { subjectLocalId: "e1", predicate: "due_date", cardinality: "one", value: { kind: "date", date: "2026-11-01" } },
    { subjectLocalId: "e1", predicate: "issued_by", cardinality: "one", value: { kind: "entity", entityLocalId: "e2" } },
  ],
};

test("parse reply: entities with inline facts, concepts listed apart", () => {
  const out = buildParseReply({ extraction: richExtraction });
  assert.match(out, /Here's what I filed/);
  assert.match(out, /• INV-777 \(invoice\) — amount: 250 USD · due date: 2026-11-01 · issued by: Initech Corp/);
  assert.match(out, /• Initech Corp \(company\)/);
  assert.match(out, /• Sarah Connor \(person\)/);
  assert.match(out, /tagged: procurement/);
  assert.doesNotMatch(out, /• procurement/, "concepts are tags, not entity lines");
});

test("parse reply: nothing to file — says so plainly", () => {
  const out = buildParseReply({ extraction: { entities: [], facts: [] } });
  assert.match(out, /Nothing to file from this one/);
  assert.doesNotMatch(out, /Here's what I filed/);
});

test("parse reply: concept-only extraction still counts as nothing concrete", () => {
  const out = buildParseReply({
    extraction: { entities: [{ localId: "c1", kind: "concept", label: "ideas" }], facts: [] },
  });
  assert.match(out, /Nothing to file/);
});

test("parse reply: documents, note, and review count ride along", () => {
  const out = buildParseReply({
    extraction: { entities: [], facts: [] },
    docs: [{ filename: "invoice.pdf", factsNew: 4 }, { filename: null, factsNew: 0 }],
    noteTitle: "Brightwave discount decision",
    pendingQuestions: 2,
  });
  assert.match(out, /▤ read invoice\.pdf — 4 facts/);
  assert.match(out, /▤ read attachment/);
  assert.match(out, /✎ kept a note: "Brightwave discount decision"/);
  assert.match(out, /2 things I wasn't sure about/);
  assert.doesNotMatch(out, /Nothing to file/, "docs+note mean something WAS filed");
});

test("parse reply: entity list caps at 8 with a remainder line", () => {
  const many: Extraction = {
    entities: Array.from({ length: 12 }, (_, i) => ({ localId: `e${i}`, kind: "person", label: `Person ${i}` })),
    facts: [],
  };
  const out = buildParseReply({ extraction: many });
  assert.equal((out.match(/^• Person /gm) ?? []).length, 8);
  assert.match(out, /…and 4 more/);
});

test("parse reply: long text values truncate", () => {
  const out = buildParseReply({
    extraction: {
      entities: [{ localId: "e1", kind: "note", label: "N" }],
      facts: [{ subjectLocalId: "e1", predicate: "body", value: { kind: "text", text: "x".repeat(80) } }],
    },
  });
  assert.match(out, /x{37}…/);
  assert.doesNotMatch(out, /x{50}/);
});

test("ping gate: active app chat and outbound channels reply; passive and dead-end channels stay silent", () => {
  assert.equal(shouldSendParseReply({ captureMode: "active", channel: "upload", viaApp: true }), "app");
  assert.equal(shouldSendParseReply({ captureMode: "active", channel: "slack", viaApp: false }), "channel");
  assert.equal(shouldSendParseReply({ captureMode: "active", channel: "whatsapp", viaApp: false }), "channel");
  assert.equal(shouldSendParseReply({ captureMode: "active", channel: "email", viaApp: false }), "channel");
  // Passive watching (IMAP) — never narrate the user's inbox.
  assert.equal(shouldSendParseReply({ captureMode: "auto", channel: "email", viaApp: false }), null);
  // No outbound sender / the caller answers itself.
  assert.equal(shouldSendParseReply({ captureMode: "active", channel: "teams", viaApp: false }), null);
  assert.equal(shouldSendParseReply({ captureMode: "active", channel: "upload", viaApp: false }), null);
});
