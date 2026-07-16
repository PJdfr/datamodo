// Tests for the triviality gate (lib/datamodo/extract-gate.ts) — the rule
// that saves an LLM call + an embedding on unmistakable acks, and MUST err
// toward extracting on anything else.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { worthExtracting } from "../lib/datamodo/extract-gate.ts";

const skip = (text: string, subject?: string | null) =>
  assert.equal(worthExtracting({ text, subject }), false, `should SKIP: "${text}"`);
const keep = (text: string, subject?: string | null) =>
  assert.equal(worthExtracting({ text, subject }), true, `should EXTRACT: "${text}"`);

test("gate skips unmistakable acks (en/fr, emoji, punctuation)", () => {
  skip("ok");
  skip("Ok thanks!");
  skip("thank you!!");
  skip("merci 🙏");
  skip("ça marche");
  skip("bien reçu, merci");
  skip("👍");
  skip("Parfait, merci !");
  skip("got it");
  skip("");
  skip("   ");
});

test("gate keeps anything with an information signal", () => {
  keep("ok, pay $100"); // currency
  keep("thanks — invoice 42 attached"); // digit
  keep("merci, voir https://acme.com"); // url
  keep("ok @bookkeeper"); // handle
  keep("thanks?"); // a question deserves the pipeline
  keep("ok for June 3rd");
});

test("gate keeps real sentences, unknown words, and long messages", () => {
  keep("thanks, I signed the Acme contract yesterday");
  keep("ok let's move the meeting to next tuesday morning");
  keep("d'accord pour le nouveau contrat Brightwave");
  keep("x".repeat(100)); // length alone passes
});

test("gate always passes attachments and note-marker subjects", () => {
  assert.equal(worthExtracting({ text: "ok", hasAttachments: true }), true);
  keep("ok", "note: garden ideas");
  keep("", "Memo about pricing");
});
