// Unit tests for the channel "pull request" (lib/datamodo/review-ping.ts):
// the outbound ping message and the reply-to-approve parser.
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reviewQuestion,
  buildReviewPing,
  parseReviewReply,
  MAX_PING_QUESTIONS,
} from "../lib/datamodo/review-ping.ts";

test("reviewQuestion: every review kind reads as one plain question", () => {
  assert.equal(
    reviewQuestion("entity_merge", { parsedLabel: "ACME Incorporated" }, "ACME Incorporated", "Acme Group"),
    'Merge "ACME Incorporated" into "Acme Group"?',
  );
  assert.equal(
    reviewQuestion("category_proposal", { label: "Subscription", count: 3 }),
    'Create the category "Subscription" (3 things waiting)?',
  );
  assert.equal(
    reviewQuestion("fact_conflict", { predicate: "due_date" }, null, "INV-4417"),
    '"due date" changed on INV-4417 — keep the new value?',
  );
  assert.match(reviewQuestion("off_template", { docLabel: "contract.pdf" }), /outside its template/);
  assert.match(reviewQuestion("extraction", {}, "Acme"), /low confidence/);
});

test("buildReviewPing: numbered questions, reply hint, link, extras", () => {
  const text = buildReviewPing(
    [
      { id: "a", question: 'Merge "X" into "Y"?' },
      { id: "b", question: 'Create the category "Subscription"?' },
    ],
    { reviewUrl: "https://app.example/dashboard", extraProposals: 2 },
  );
  assert.match(text, /^datamodo — 2 things need your OK:/);
  assert.match(text, /1\. Merge "X" into "Y"\?/);
  assert.match(text, /2\. Create the category "Subscription"\?/);
  assert.match(text, /\(\+2 table changes to review in the app\.\)/);
  assert.match(text, /Reply "1 yes" \/ "2 no"/);
  assert.match(text, /https:\/\/app\.example\/dashboard/);
});

test("buildReviewPing: a single question asks for a bare yes/no; overflow is honest", () => {
  const one = buildReviewPing([{ id: "a", question: "Merge?" }], {});
  assert.match(one, /one thing needs your OK/);
  assert.match(one, /Reply "yes" or "no"/);
  const many = buildReviewPing(
    Array.from({ length: MAX_PING_QUESTIONS + 3 }, (_, i) => ({ id: String(i), question: `Q${i}?` })),
    {},
  );
  assert.match(many, /…and 3 more in the app\./);
});

test("parseReviewReply: the reply shapes people actually type", () => {
  assert.deepEqual(parseReviewReply("1 yes", 3), { index: 1, accept: true });
  assert.deepEqual(parseReviewReply("1y", 3), { index: 1, accept: true });
  assert.deepEqual(parseReviewReply("YES 2", 3), { index: 2, accept: true });
  assert.deepEqual(parseReviewReply("approve 3", 3), { index: 3, accept: true });
  assert.deepEqual(parseReviewReply("2n", 3), { index: 2, accept: false });
  assert.deepEqual(parseReviewReply("no 1", 3), { index: 1, accept: false });
  assert.deepEqual(parseReviewReply("reject 2", 3), { index: 2, accept: false });
  // Bare yes/no only when exactly one thing is pending.
  assert.deepEqual(parseReviewReply("yes", 1), { index: 1, accept: true });
  assert.deepEqual(parseReviewReply("ok", 1), { index: 1, accept: true });
  assert.equal(parseReviewReply("yes", 2), null);
});

test("parseReviewReply: real messages are NEVER swallowed as decisions", () => {
  assert.equal(parseReviewReply("Meet Maria Gomez, she runs ops at Northwind", 3), null);
  assert.equal(parseReviewReply("invoice 12000 from acme", 3), null);
  assert.equal(parseReviewReply("note: yes we should renew brightwave", 3), null);
  assert.equal(parseReviewReply("4 yes", 3), null, "out-of-range index");
  assert.equal(parseReviewReply("", 3), null);
  assert.equal(parseReviewReply("yes", 0), null, "nothing pending");
});
