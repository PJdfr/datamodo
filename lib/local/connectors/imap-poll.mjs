// LOCAL EDITION — IMAP connector, runtime side (config + poller).
//
// Run by the `datamodo` CLI (plain Node — no TypeScript at runtime), this
// module owns everything the mapping core (imap.ts) doesn't: validating the
// user's `connectors.json`, keeping a per-connector UID cursor so we only pull
// NEW mail, and the IMAP session itself (imapflow). For each new message it
// downloads the raw RFC822 source and POSTs it to the local `/api/local/imap`
// route, which parses + ingests it through the shared capture pipeline.
//
// Kept dependency-light and side-effect-injectable (the fetcher + ImapFlow are
// parameters) so the pure parts unit-test without a network or a real mailbox.

import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_IMAP_PORT = 993;
const CONNECTORS_FILE = "connectors.json";
const CURSOR_FILE = "connectors-state.json";

const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * Validate + normalize raw connectors.json into typed IMAP connectors. Unknown
 * `kind`s are skipped (forward-compat); malformed IMAP entries throw with a
 * pointed message. Pure.
 */
export function parseConnectors(raw) {
  if (raw == null) return [];
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.connectors)
      ? raw.connectors
      : null;
  if (!list) throw new Error("connectors config must be an array (or { connectors: [...] })");

  const out = [];
  const seen = new Set();
  list.forEach((entry, i) => {
    const e = entry ?? {};
    if (e.kind !== undefined && e.kind !== "imap") return; // skip other kinds
    const where = `connector #${i + 1}`;
    if (!isStr(e.host)) throw new Error(`${where}: missing "host"`);
    if (!isStr(e.user)) throw new Error(`${where}: missing "user"`);
    if (!isStr(e.password)) throw new Error(`${where}: missing "password"`);

    const port = Number(e.port ?? DEFAULT_IMAP_PORT);
    if (!Number.isFinite(port) || port <= 0) throw new Error(`${where}: invalid "port"`);

    const id = isStr(e.id) ? e.id.trim() : `imap:${e.user.trim()}@${e.host.trim()}`;
    if (seen.has(id)) throw new Error(`${where}: duplicate connector id "${id}"`);
    seen.add(id);

    out.push({
      id,
      kind: "imap",
      host: e.host.trim(),
      port,
      secure: e.secure === undefined ? port === DEFAULT_IMAP_PORT : Boolean(e.secure),
      user: e.user.trim(),
      password: String(e.password),
      mailbox: isStr(e.mailbox) ? e.mailbox.trim() : "INBOX",
    });
  });
  return out;
}

/** Advance a per-connector UID cursor (highest UID seen). Pure. */
export function advanceCursor(prev, uid) {
  return Math.max(Number(prev) || 0, Number(uid) || 0);
}

/** Read + validate connectors.json from the data dir (empty list if absent). */
export async function loadConnectors(dataDir) {
  const file = path.join(dataDir, CONNECTORS_FILE);
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
  return parseConnectors(JSON.parse(text));
}

/** Write connectors.json, locking the credentials file down to the owner. The
 *  full set is re-validated first (assigns derived ids, rejects dupes). */
export async function writeConnectors(dataDir, connectors) {
  const validated = parseConnectors(connectors);
  const file = path.join(dataDir, CONNECTORS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ connectors: validated }, null, 2));
  await fs.chmod(file, 0o600).catch(() => {});
  return validated;
}

/** Add one connector (validated + deduped against the existing set). Returns
 *  the newly-added, normalized connector. Shared by the CLI + dashboard. */
export async function addConnector(dataDir, entry) {
  const existing = await loadConnectors(dataDir);
  const merged = await writeConnectors(dataDir, [...existing, entry]);
  return merged[merged.length - 1];
}

/** Remove a connector by id. Returns true if one was removed. */
export async function removeConnector(dataDir, id) {
  const existing = await loadConnectors(dataDir);
  const next = existing.filter((c) => c.id !== id);
  if (next.length === existing.length) return false;
  await writeConnectors(dataDir, next);
  return true;
}

/** The connector list with secrets stripped — safe to hand to the browser. */
export async function publicConnectors(dataDir) {
  return (await loadConnectors(dataDir)).map((c) => ({
    id: c.id,
    kind: c.kind,
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    mailbox: c.mailbox,
  }));
}

/** Read the per-connector UID cursor map ({} if absent). */
export async function loadCursors(dataDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, CURSOR_FILE), "utf8"));
  } catch (e) {
    if (e?.code === "ENOENT") return {};
    throw e;
  }
}

/** Persist the per-connector UID cursor map (atomic-ish write). */
export async function saveCursors(dataDir, cursors) {
  const file = path.join(dataDir, CURSOR_FILE);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cursors, null, 2));
  await fs.rename(tmp, file);
}

const noop = () => {};

/**
 * Pull new mail for ONE connector and POST each message to the local ingest
 * route. Returns the count captured this pass. `deps` injects the IMAP client
 * class and the fetcher so this is unit-testable without a live server:
 *   deps.ImapFlow  — the imapflow class (defaults to the real one)
 *   deps.post      — async ({ connectorId, user, uid, rawBase64 }) => ok:boolean
 *   deps.getCursor / deps.setCursor — read/persist this connector's UID cursor
 *
 * First sight of a connector records the mailbox high-water mark and captures
 * nothing (so connecting an old mailbox doesn't backfill years of mail); new
 * messages flow in from then on.
 */
export async function pollConnector(connector, deps) {
  const { ImapFlow, post, getCursor, setCursor, log = noop } = deps;
  const client = new ImapFlow({
    host: connector.host,
    port: connector.port,
    secure: connector.secure,
    auth: { user: connector.user, pass: connector.password },
    logger: false,
  });

  let captured = 0;
  await client.connect();
  const lock = await client.getMailboxLock(connector.mailbox);
  try {
    const uidNext = Number(client.mailbox?.uidNext) || 1;
    let cursor = Number(await getCursor(connector.id)) || 0;

    // First run: high-water mark only, capture nothing.
    if (!cursor) {
      cursor = Math.max(0, uidNext - 1);
      await setCursor(connector.id, cursor);
      log(`[${connector.id}] connected — watching for new mail (from uid ${cursor + 1})`);
      return 0;
    }

    const since = cursor + 1;
    if (since >= uidNext) return 0; // nothing new

    for await (const msg of client.fetch({ uid: `${since}:*` }, { uid: true, source: true })) {
      // A `since:*` range returns the highest message even when none is new;
      // skip anything at or below the cursor.
      if (!msg?.uid || msg.uid < since || !msg.source) continue;
      const ok = await post({
        connectorId: connector.id,
        user: connector.user,
        uid: msg.uid,
        rawBase64: Buffer.from(msg.source).toString("base64"),
      });
      if (!ok) {
        log(`[${connector.id}] ingest rejected uid ${msg.uid} — stopping this pass`);
        break; // don't advance past a failure; retry next tick
      }
      cursor = advanceCursor(cursor, msg.uid);
      await setCursor(connector.id, cursor);
      captured++;
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  if (captured) log(`[${connector.id}] captured ${captured} message(s)`);
  return captured;
}

/**
 * The connector loop: every `intervalMs`, poll each configured connector. Errors
 * are per-connector and non-fatal (logged, retried next tick). Returns a
 * `stop()` handle. `deps` overrides ImapFlow/fetch/timers for tests; in
 * production it defaults to the real imapflow + global fetch.
 */
export async function startConnectors({ dataDir, endpoint, secret, intervalMs = 60_000, log = console.log }, deps = {}) {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const cursors = await loadCursors(dataDir);
  let ImapFlow = deps.ImapFlow ?? null;

  const getCursor = (id) => cursors[id];
  const setCursor = async (id, uid) => {
    cursors[id] = uid;
    await saveCursors(dataDir, cursors);
  };
  const post = async (payload) => {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-secret": secret },
      body: JSON.stringify(payload),
    });
    return res.ok;
  };

  let stopped = false;
  // Re-read connectors.json every tick so mailboxes added/removed from the
  // dashboard (Settings → Connectors) take effect within one interval — no
  // `serve` restart. A hand-corrupted file is logged, not fatal.
  const tick = async () => {
    if (stopped) return 0;
    let connectors;
    try {
      connectors = await loadConnectors(dataDir);
    } catch (e) {
      log(`datamodo: connectors.json is invalid — ${e?.message ?? e}`);
      return 0;
    }
    if (!connectors.length) return 0;
    if (!ImapFlow) ImapFlow = (await import("imapflow")).ImapFlow;
    let captured = 0;
    for (const connector of connectors) {
      if (stopped) break;
      try {
        captured += await pollConnector(connector, { ImapFlow, post, getCursor, setCursor, log });
      } catch (e) {
        log(`[${connector.id}] poll failed: ${e?.message ?? e}`);
      }
    }
    return captured;
  };

  const initial = await loadConnectors(dataDir).catch(() => []);
  log(`datamodo: watching ${initial.length} mailbox(es) over IMAP (add more from Settings → Connectors)`);
  await tick();
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return {
    connectors: initial,
    tick, // exposed for a "poll now" trigger + tests
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
