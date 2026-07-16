// Unit tests for the outbound EMAIL sender (lib/datamodo/outbound.ts, Resend)
// and the one-way ping copy (review-ping.ts replyable:false). The Resend API
// is stood in by a local HTTP server via RESEND_BASE_URL — the same override
// a self-hosted proxy would use. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { sendChannelText } from "../lib/datamodo/outbound.ts";
import { buildReviewPing } from "../lib/datamodo/review-ping.ts";

interface Seen {
  auth?: string;
  body?: Record<string, unknown>;
  url?: string;
}

function withMockResend(status: number, fn: (seen: Seen) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const seen: Seen = {};
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        seen.auth = req.headers.authorization;
        seen.url = req.url ?? "";
        try {
          seen.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch { /* leave undefined */ }
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(status < 300 ? { id: "mock" } : { message: "nope" }));
      });
    });
    server.listen(0, "127.0.0.1", async () => {
      const { port } = server.address() as AddressInfo;
      const prev = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, base: process.env.RESEND_BASE_URL };
      process.env.RESEND_API_KEY = "re_test_123";
      process.env.EMAIL_FROM = "datamodo <ping@datamodo.dev>";
      process.env.RESEND_BASE_URL = `http://127.0.0.1:${port}`;
      try {
        await fn(seen);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        process.env.RESEND_API_KEY = prev.key;
        process.env.EMAIL_FROM = prev.from;
        process.env.RESEND_BASE_URL = prev.base;
        if (prev.key === undefined) delete process.env.RESEND_API_KEY;
        if (prev.from === undefined) delete process.env.EMAIL_FROM;
        if (prev.base === undefined) delete process.env.RESEND_BASE_URL;
        server.close();
      }
    });
  });
}

test("email ping: posts to Resend with from/to/subject/text + bearer key", async () => {
  await withMockResend(200, async (seen) => {
    const r = await sendChannelText("email", "user@example.com", "datamodo — one thing needs your OK:\n1. Merge?");
    assert.equal(r.sent, true);
    assert.equal(seen.url, "/emails");
    assert.equal(seen.auth, "Bearer re_test_123");
    assert.equal(seen.body?.from, "datamodo <ping@datamodo.dev>");
    assert.deepEqual(seen.body?.to, ["user@example.com"]);
    assert.match(String(seen.body?.subject), /needs? your OK/i);
    assert.match(String(seen.body?.text), /Merge\?/);
  });
});

test("email ping: provider error → sent:false with the reason, never throws", async () => {
  await withMockResend(422, async () => {
    const r = await sendChannelText("email", "user@example.com", "hi");
    assert.equal(r.sent, false);
    assert.match(r.reason ?? "", /resend 422/);
  });
});

test("email ping: dormant without env; rejects a non-address handle", async () => {
  const prev = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  try {
    const r = await sendChannelText("email", "user@example.com", "hi");
    assert.equal(r.sent, false);
    assert.match(r.reason ?? "", /env not set/);
  } finally {
    if (prev.key !== undefined) process.env.RESEND_API_KEY = prev.key;
    if (prev.from !== undefined) process.env.EMAIL_FROM = prev.from;
  }
  await withMockResend(200, async () => {
    const r = await sendChannelText("email", "not-an-address", "hi");
    assert.equal(r.sent, false);
    assert.match(r.reason ?? "", /not an email address/);
  });
});

test("buildReviewPing: one-way channels get a review link, never a reply hint", () => {
  const oneWay = buildReviewPing(
    [{ id: "a", question: 'Merge "X" into "Y"?' }],
    { reviewUrl: "https://app.example/dashboard", replyable: false },
  );
  assert.doesNotMatch(oneWay, /Reply/);
  assert.match(oneWay, /Review at https:\/\/app.example\/dashboard\./);

  // Default stays replyable (WhatsApp/Slack behavior unchanged).
  const twoWay = buildReviewPing([{ id: "a", question: "Merge?" }], { reviewUrl: "https://x.y/d" });
  assert.match(twoWay, /Reply "yes" or "no"/);
});
