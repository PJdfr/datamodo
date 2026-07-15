// Unit tests for the local-edition IMAP connector:
//   - the mapping core (lib/local/connectors/imap.ts): parsed mail → envelope
//   - the runtime core (lib/local/connectors/imap-poll.mjs): config parsing,
//     the UID cursor, cursor file I/O, and the poll loop (with a fake IMAP
//     client + fetch, so no network or real mailbox is needed).
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parsedMailToEnvelope } from "../lib/local/connectors/imap.ts";
import {
  parseConnectors,
  advanceCursor,
  loadConnectors,
  loadCursors,
  saveCursors,
  pollConnector,
  startConnectors,
  addConnector,
  removeConnector,
  publicConnectors,
} from "../lib/local/connectors/imap-poll.mjs";

// ---- mapping core -----------------------------------------------------------

test("parsedMailToEnvelope: maps a full message", () => {
  const env = parsedMailToEnvelope(
    {
      messageId: "<abc@ex.com>",
      subject: "  Invoice 42  ",
      from: { text: "Alex <alex@ex.com>", value: [{ address: "alex@ex.com", name: "Alex" }] },
      to: { value: [{ address: "me@ex.com" }] },
      cc: { value: [{ address: "cc@ex.com" }] },
      date: new Date("2026-01-02T03:04:05Z"),
      text: "  hello  ",
      html: "<p>hello</p>",
      attachments: [{ filename: "a.pdf", contentType: "application/pdf", content: Buffer.from("PDF") }],
    },
    { connector: { id: "imap:me@ex.com", user: "me@ex.com" }, uid: 7, rawBase64: "UkFX" },
  );

  assert.equal(env.channel, "email");
  assert.equal(env.captureMode, "auto");
  assert.equal(env.externalId, "imap:me@ex.com:abc@ex.com");
  assert.equal(env.externalAccount, "me@ex.com");
  assert.equal(env.sender, "Alex <alex@ex.com>");
  assert.deepEqual(env.recipients, ["me@ex.com", "cc@ex.com"]);
  assert.equal(env.subject, "Invoice 42");
  assert.equal(env.sentAt, "2026-01-02T03:04:05.000Z");
  assert.equal(env.bodyText, "hello");
  assert.equal(env.bodyHtml, "<p>hello</p>");
  assert.deepEqual(env.raw, { contentType: "message/rfc822", dataBase64: "UkFX" });
  assert.equal(env.attachments?.length, 1);
  assert.equal(env.attachments?.[0].dataBase64, Buffer.from("PDF").toString("base64"));
  assert.equal((env.meta as Record<string, unknown>).imap_uid, 7);
  assert.equal((env.meta as Record<string, unknown>).via, "imap");
});

test("parsedMailToEnvelope: no message-id falls back to uid; html:false → no bodyHtml", () => {
  const env = parsedMailToEnvelope(
    { subject: "x", html: false, text: "body" },
    { connector: { id: "c1", user: "u" }, uid: 99 },
  );
  assert.equal(env.externalId, "c1:uid-99");
  assert.equal(env.bodyHtml, undefined);
  assert.equal(env.raw, undefined);
  assert.deepEqual(env.attachments, []);
});

// ---- config parsing ---------------------------------------------------------

test("parseConnectors: defaults + derived id", () => {
  const [c] = parseConnectors([{ host: "imap.ex.com", user: "me@ex.com", password: "pw" }]);
  assert.equal(c.id, "imap:me@ex.com@imap.ex.com");
  assert.equal(c.port, 993);
  assert.equal(c.secure, true);
  assert.equal(c.mailbox, "INBOX");
});

test("parseConnectors: { connectors: [...] } wrapper + non-imap skipped + insecure port", () => {
  const list = parseConnectors({
    connectors: [
      { kind: "telegram", token: "t" },
      { host: "h", user: "u", password: "p", port: 143 },
    ],
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].port, 143);
  assert.equal(list[0].secure, false); // non-993 defaults to plaintext
});

test("parseConnectors: throws on missing fields + duplicate ids", () => {
  assert.throws(() => parseConnectors([{ user: "u", password: "p" }]), /missing "host"/);
  assert.throws(
    () => parseConnectors([
      { id: "dup", host: "h", user: "u", password: "p" },
      { id: "dup", host: "h2", user: "u2", password: "p2" },
    ]),
    /duplicate connector id/,
  );
});

test("advanceCursor: monotonic high-water mark", () => {
  assert.equal(advanceCursor(undefined, 5), 5);
  assert.equal(advanceCursor(9, 3), 9);
  assert.equal(advanceCursor(2, 8), 8);
});

// ---- cursor file I/O --------------------------------------------------------

test("loadCursors/saveCursors: round-trip + absent default", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-imap-"));
  assert.deepEqual(await loadCursors(dir), {});
  await saveCursors(dir, { c1: 12 });
  assert.deepEqual(await loadCursors(dir), { c1: 12 });
});

test("loadConnectors: absent file → []", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-imap-"));
  assert.deepEqual(await loadConnectors(dir), []);
});

// ---- connectors store (shared by CLI + dashboard) ---------------------------

test("addConnector/removeConnector/publicConnectors: round-trip, no password leak", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-imap-"));
  const added = await addConnector(dir, { host: "imap.ex.com", user: "me@ex.com", password: "secret" });
  assert.equal(added.id, "imap:me@ex.com@imap.ex.com");

  const pub = await publicConnectors(dir);
  assert.equal(pub.length, 1);
  assert.equal(pub[0].host, "imap.ex.com");
  assert.equal("password" in pub[0], false); // secret never handed out

  // The password IS persisted for the poller to use.
  assert.equal((await loadConnectors(dir))[0].password, "secret");

  assert.equal(await removeConnector(dir, added.id), true);
  assert.equal(await removeConnector(dir, added.id), false); // already gone
  assert.deepEqual(await publicConnectors(dir), []);
});

test("addConnector: rejects a duplicate id", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-imap-"));
  await addConnector(dir, { host: "h", user: "u", password: "p" });
  await assert.rejects(() => addConnector(dir, { host: "h", user: "u", password: "p2" }), /duplicate connector id/);
});

// ---- poll loop (fake IMAP) --------------------------------------------------

function fakeImapClass({ uidNext, messages }: { uidNext: number; messages: Array<{ uid: number; source: string }> }) {
  return class FakeImap {
    mailbox: { uidNext: number } | null = null;
    async connect() {}
    async getMailboxLock() {
      this.mailbox = { uidNext };
      return { release() {} };
    }
    async *fetch() {
      for (const m of messages) yield { uid: m.uid, source: Buffer.from(m.source) };
    }
    async logout() {}
  };
}

test("pollConnector: first run records high-water mark, captures nothing", async () => {
  const cursors: Record<string, number> = {};
  const posted: number[] = [];
  const n = await pollConnector(
    { id: "c1", host: "h", port: 993, secure: true, user: "u", password: "p", mailbox: "INBOX" },
    {
      ImapFlow: fakeImapClass({ uidNext: 10, messages: [{ uid: 5, source: "old" }] }),
      post: async ({ uid }: { uid: number }) => { posted.push(uid); return true; },
      getCursor: (id: string) => cursors[id],
      setCursor: async (id: string, uid: number) => { cursors[id] = uid; },
    },
  );
  assert.equal(n, 0);
  assert.equal(cursors.c1, 9);
  assert.deepEqual(posted, []);
});

test("pollConnector: posts only messages above the cursor, advances it", async () => {
  const cursors: Record<string, number> = { c1: 9 };
  const posted: number[] = [];
  const n = await pollConnector(
    { id: "c1", host: "h", port: 993, secure: true, user: "u", password: "p", mailbox: "INBOX" },
    {
      ImapFlow: fakeImapClass({
        uidNext: 12,
        messages: [{ uid: 5, source: "stale" }, { uid: 10, source: "a" }, { uid: 11, source: "b" }],
      }),
      post: async ({ uid }: { uid: number }) => { posted.push(uid); return true; },
      getCursor: (id: string) => cursors[id],
      setCursor: async (id: string, uid: number) => { cursors[id] = uid; },
    },
  );
  assert.equal(n, 2);
  assert.deepEqual(posted, [10, 11]); // uid 5 skipped (<= cursor)
  assert.equal(cursors.c1, 11);
});

test("pollConnector: stops (no cursor advance) when ingest rejects", async () => {
  const cursors: Record<string, number> = { c1: 9 };
  const n = await pollConnector(
    { id: "c1", host: "h", port: 993, secure: true, user: "u", password: "p", mailbox: "INBOX" },
    {
      ImapFlow: fakeImapClass({ uidNext: 13, messages: [{ uid: 10, source: "a" }, { uid: 11, source: "b" }] }),
      post: async ({ uid }: { uid: number }) => uid !== 11, // reject uid 11
      getCursor: (id: string) => cursors[id],
      setCursor: async (id: string, uid: number) => { cursors[id] = uid; },
    },
  );
  assert.equal(n, 1);
  assert.equal(cursors.c1, 10); // did not advance past the failed message
});

test("startConnectors: no connectors → no-op", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-imap-"));
  const handle = await startConnectors({ dataDir: dir, endpoint: "http://x/", secret: "s" });
  assert.deepEqual(handle.connectors, []);
  handle.stop();
});

test("startConnectors: polls configured connectors via injected client + fetch", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-imap-"));
  await saveCursors(dir, { "imap:me@ex.com@h": 9 }); // skip first-run high-water mark
  await fs.writeFile(
    path.join(dir, "connectors.json"),
    JSON.stringify({ connectors: [{ host: "h", user: "me@ex.com", password: "pw" }] }),
  );
  const bodies: Array<Record<string, unknown>> = [];
  const handle = await startConnectors(
    { dataDir: dir, endpoint: "http://x/api/local/imap", secret: "s", intervalMs: 1_000_000, log: () => {} },
    {
      ImapFlow: fakeImapClass({ uidNext: 11, messages: [{ uid: 10, source: "hi" }] }),
      fetch: async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return { ok: true } as Response;
      },
    },
  );
  handle.stop();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].uid, 10);
  assert.equal(bodies[0].connectorId, "imap:me@ex.com@h");
  assert.equal(Buffer.from(bodies[0].rawBase64 as string, "base64").toString(), "hi");
});

test("startConnectors: hot-reloads a connector added after start (no restart)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-imap-"));
  const bodies: Array<Record<string, unknown>> = [];
  // A mutable mailbox so we can make new mail "arrive" between ticks.
  const state = { uidNext: 10, messages: [] as Array<{ uid: number; source: string }> };
  class StatefulFake {
    mailbox: { uidNext: number } | null = null;
    async connect() {}
    async getMailboxLock() { this.mailbox = { uidNext: state.uidNext }; return { release() {} }; }
    async *fetch() { for (const m of state.messages) yield { uid: m.uid, source: Buffer.from(m.source) }; }
    async logout() {}
  }

  // Start with NO connectors configured.
  const handle = await startConnectors(
    { dataDir: dir, endpoint: "http://x/", secret: "s", intervalMs: 1_000_000, log: () => {} },
    {
      ImapFlow: StatefulFake,
      fetch: async (_url: string, init: { body: string }) => { bodies.push(JSON.parse(init.body)); return { ok: true } as Response; },
    },
  );
  assert.deepEqual(handle.connectors, []);

  // Add a mailbox from "the dashboard" — the next tick must pick it up, record
  // the high-water mark, and capture NOTHING (no backfill of old mail).
  const added = await addConnector(dir, { host: "h", user: "me@ex.com", password: "pw" });
  await handle.tick();
  assert.equal(bodies.length, 0);
  assert.equal((await loadCursors(dir))[added.id], 9); // uidNext(10) - 1

  // New mail arrives → the following tick captures it.
  state.uidNext = 11;
  state.messages = [{ uid: 10, source: "new" }];
  await handle.tick();
  handle.stop();

  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].uid, 10);
  assert.equal((await loadCursors(dir))[added.id], 10);
});
