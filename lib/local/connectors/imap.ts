// LOCAL EDITION — IMAP connector, mapping core.
//
// The cloud edition captures mail through a hosted email worker + public
// webhook; a local install has no public URL, so instead it PULLS from the
// user's own mailbox over IMAP. This TS module owns the ONE piece the server
// needs: turning a parsed RFC822 message into the canonical IngestEnvelope. It
// does no network I/O, so it unit-tests cleanly.
//
// The rest of the connector — config parsing, the IMAP session, the UID cursor
// — lives in `imap-poll.mjs` (plain JS, run by the `datamodo` CLI, which can't
// import TypeScript at runtime). Flow: the poller logs into IMAP, downloads
// each new message's raw source, and POSTs it to `/api/local/imap`; that route
// parses it (mailparser) and calls `parsedMailToEnvelope`, then feeds the
// envelope through the SAME capture pipeline as every other channel.

import type { IngestEnvelope } from "@/lib/ingest/types";

/** The minimal slice of mailparser's `ParsedMail` the mapper reads — declared
 *  structurally so tests (and the pure core) never need mailparser itself. */
export interface ParsedMailLike {
  messageId?: string;
  subject?: string;
  from?: { text?: string; value?: Array<{ address?: string; name?: string }> };
  to?: { text?: string; value?: Array<{ address?: string }> };
  cc?: { value?: Array<{ address?: string }> };
  date?: Date | string;
  text?: string;
  html?: string | false;
  attachments?: Array<{
    filename?: string;
    contentType?: string;
    content?: Buffer | Uint8Array;
  }>;
}

export interface MapOptions {
  /** The connector this message was pulled through (provenance + idempotency). */
  connector: { id: string; user: string };
  /** IMAP UID of this message (provenance + cursor). */
  uid: number;
  /** The raw RFC822 source, base64 — archived verbatim for fidelity/replay. */
  rawBase64?: string;
}

function addrList(box?: { value?: Array<{ address?: string }> }): string[] {
  return (box?.value ?? []).map((v) => v.address).filter((a): a is string => !!a);
}

function toIso(d: Date | string | undefined): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Map a parsed IMAP message into the canonical ingest envelope. Channel is
 * `email` / capture mode `auto` (a pulled firehose, not a hand-forward). The
 * message-id (namespaced by connector) is the idempotency key so re-polling the
 * same UID — or the same message in two folders — is captured once. Pure.
 */
export function parsedMailToEnvelope(mail: ParsedMailLike, opts: MapOptions): IngestEnvelope {
  const { connector, uid, rawBase64 } = opts;
  const recipients = [...addrList(mail.to), ...addrList(mail.cc)];
  const messageId = mail.messageId?.replace(/^<|>$/g, "").trim() || undefined;

  const attachments = (mail.attachments ?? [])
    .filter((a) => a.content)
    .map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      dataBase64: Buffer.from(a.content as Uint8Array).toString("base64"),
    }));

  return {
    channel: "email",
    captureMode: "auto",
    // Namespace the idempotency key by connector so two mailboxes that happen to
    // carry the same message-id don't collide; fall back to the UID when a
    // message has no Message-ID header.
    externalId: `${connector.id}:${messageId ?? `uid-${uid}`}`,
    externalAccount: connector.user,
    sender: mail.from?.text?.trim() || mail.from?.value?.[0]?.address || undefined,
    recipients,
    subject: mail.subject?.trim() || undefined,
    sentAt: toIso(mail.date),
    bodyText: mail.text?.trim() || undefined,
    bodyHtml: typeof mail.html === "string" && mail.html.trim() ? mail.html : undefined,
    raw: rawBase64 ? { contentType: "message/rfc822", dataBase64: rawBase64 } : undefined,
    attachments,
    meta: { via: "imap", connector_id: connector.id, imap_uid: uid, message_id: messageId ?? null },
  };
}
