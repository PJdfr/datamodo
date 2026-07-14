// Unit tests for chat addressing (lib/datamodo/chat-address.ts) — the
// @mention mechanics behind the Chat agent picker. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMention, matchAgents, stripMention, type ChatAgentRef } from "../lib/datamodo/chat-address.ts";

const AGENTS: ChatAgentRef[] = [
  { id: "1", name: "Recruiting", purposeText: "candidates & interviews" },
  { id: "2", name: "Rent collector", purposeText: "tenant payments" },
  { id: "3", name: "The Records keeper", purposeText: null },
  { id: "4", name: "Invoices", purposeText: "billing" },
];

test("activeMention: @ at start or after whitespace, query runs to the caret", () => {
  assert.deepEqual(activeMention("@rec", 4), { start: 0, end: 4, query: "rec" });
  assert.deepEqual(activeMention("send this @Rent col", 19), { start: 10, end: 19, query: "Rent col" });
  assert.equal(activeMention("mail user@example.com", 21), null, "emails are not mentions");
  assert.equal(activeMention("no at-sign here", 15), null);
  assert.equal(activeMention("@one\nline two", 13), null, "mentions never span lines");
});

test("activeMention: only the text BEFORE the caret counts", () => {
  // Caret right after "@re" while more text follows.
  assert.deepEqual(activeMention("@re and more", 3), { start: 0, end: 3, query: "re" });
});

test("matchAgents: name prefix beats word prefix beats substring; deterministic", () => {
  // "rec": "Recruiting" is a name prefix, "Records" a word prefix; "Rent
  // collector" contains no "rec" and drops out.
  assert.deepEqual(matchAgents(AGENTS, "rec").map((a) => a.name), ["Recruiting", "The Records keeper"]);
  assert.deepEqual(matchAgents(AGENTS, "re").map((a) => a.name), [
    "Recruiting", "Rent collector", "The Records keeper",
  ]);
  assert.equal(matchAgents(AGENTS, "").length, 4, "bare @ lists everyone");
  assert.deepEqual(matchAgents(AGENTS, "zzz"), []);
});

test("stripMention: the chosen token leaves the message body cleanly", () => {
  const text = "send this @Rent col please";
  const span = activeMention(text, 19)!;
  assert.equal(stripMention(text, span), "send this please");
  assert.equal(stripMention("@rec", activeMention("@rec", 4)!), "");
});
