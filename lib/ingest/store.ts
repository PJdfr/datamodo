import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { putBlob, getBlob } from "@/lib/storage/blob";
import type { IngestEnvelope, IngestResult } from "./types";

const PREVIEW_LEN = 200;

export class IngestError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface Target {
  orgId: string;
  ownerUserId: string | null;
  sourceId: string | null;
  forwardingAddressId?: string;
}

/**
 * Resolve which org/user an item belongs to. Either the envelope carries an
 * explicit (orgId, ownerUserId), or we look up the recipient handle: email
 * against forwarding_addresses, every other channel against ingest_sources.
 */
async function resolveTarget(env: IngestEnvelope): Promise<Target> {
  if (env.orgId) {
    return { orgId: env.orgId, ownerUserId: env.ownerUserId ?? null, sourceId: null };
  }
  const handle = env.recipient?.trim();
  if (!handle) {
    throw new IngestError("NO_ROUTING", "envelope needs orgId or recipient", 400);
  }

  if (env.channel === "email") {
    const addr = handle.toLowerCase();
    const data = await prisma.forwarding_addresses.findFirst({
      where: { address: addr },
      select: { id: true, org_id: true, owner_user_id: true },
    });
    if (data) {
      return {
        orgId: data.org_id,
        ownerUserId: data.owner_user_id,
        sourceId: null,
        forwardingAddressId: data.id,
      };
    }
  }

  const src = await prisma.ingest_sources.findFirst({
    where: { channel: env.channel, handle },
    select: { id: true, org_id: true, owner_user_id: true },
  });
  if (src) {
    return { orgId: src.org_id, ownerUserId: src.owner_user_id, sourceId: src.id };
  }

  throw new IngestError(
    "UNKNOWN_TARGET",
    `no ${env.channel} source for "${handle}"`,
    404,
  );
}

interface StoredBlob {
  hash: string;
  reused: boolean;
  bytes: number;
}

/**
 * Store bytes content-addressed: hash → dedup → gzip (if it helps) → upload.
 * Never touches ref_count (DB triggers own that when a row references the blob).
 */
async function storeBlob(
  orgId: string,
  bytes: Buffer,
  contentType?: string,
): Promise<StoredBlob> {
  const hash = createHash("sha256").update(bytes).digest("hex");

  const existing = await prisma.blobs.findFirst({
    where: { org_id: orgId, hash },
    select: { hash: true },
  });
  if (existing) return { hash, reused: true, bytes: bytes.length };

  const gz = gzipSync(bytes);
  const useGzip = gz.length < bytes.length;
  const payload = useGzip ? gz : bytes;
  const encoding = useGzip ? "gzip" : "identity";
  const path = `${orgId}/${hash.slice(0, 2)}/${hash}`;

  // Content-addressed key: identical bytes overwrite themselves harmlessly.
  await putBlob(
    path,
    payload,
    useGzip ? "application/gzip" : contentType ?? "application/octet-stream",
  );

  try {
    await prisma.blobs.create({
      data: {
        org_id: orgId,
        hash,
        storage_path: path,
        bytes: BigInt(bytes.length),
        stored_bytes: BigInt(payload.length),
        encoding,
        content_type: contentType ?? null,
      },
    });
  } catch (e) {
    // Unique (org_id, hash) violation → another writer won the race; harmless.
    if ((e as { code?: string }).code !== "P2002") throw e;
  }

  return { hash, reused: false, bytes: bytes.length };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function preview(env: IngestEnvelope): string | null {
  const text = env.bodyText ?? (env.bodyHtml ? stripHtml(env.bodyHtml) : "");
  return text ? text.slice(0, PREVIEW_LEN) : null;
}

/**
 * Capture one item: resolve owner → idempotency check → store body, raw, and
 * every attachment (deduped + compressed) → write the index rows → mark stored.
 * Raw bytes are archived BEFORE any analysis; status flips to 'stored'.
 */
export async function ingest(env: IngestEnvelope): Promise<IngestResult> {
  if (!env.channel) throw new IngestError("NO_CHANNEL", "channel is required", 400);
  const target = await resolveTarget(env);

  // Idempotency: same provider message id per org+channel is captured once.
  if (env.externalId) {
    const dup = await prisma.items.findFirst({
      where: { org_id: target.orgId, channel: env.channel, external_id: env.externalId },
      select: { id: true, bytes: true },
    });
    if (dup) {
      return {
        itemId: dup.id,
        status: "stored",
        deduped: true,
        attachments: 0,
        blobsReused: 0,
        bytes: Number(dup.bytes ?? 0),
      };
    }
  }

  let blobsReused = 0;
  let totalBytes = 0;

  // Body: keep text + html together so nothing is lost, as one JSON blob.
  let bodyHash: string | null = null;
  if (env.bodyText || env.bodyHtml) {
    const buf = Buffer.from(
      JSON.stringify({ text: env.bodyText ?? null, html: env.bodyHtml ?? null }),
      "utf8",
    );
    const b = await storeBlob(target.orgId, buf, "application/json");
    bodyHash = b.hash;
    if (b.reused) blobsReused++;
    totalBytes += b.bytes;
  }

  // Raw provider payload (e.g. full .eml), kept verbatim for fidelity.
  let rawHash: string | null = null;
  if (env.raw?.dataBase64) {
    const buf = Buffer.from(env.raw.dataBase64, "base64");
    const b = await storeBlob(target.orgId, buf, env.raw.contentType);
    rawHash = b.hash;
    if (b.reused) blobsReused++;
    totalBytes += b.bytes;
  }

  const meta = { ...(env.meta ?? {}) } as Record<string, unknown>;
  if (target.forwardingAddressId) meta.forwarding_address_id = target.forwardingAddressId;

  const item = await prisma.items.create({
    data: {
      org_id: target.orgId,
      owner_user_id: target.ownerUserId,
      source_id: target.sourceId,
      channel: env.channel,
      capture_mode: env.captureMode ?? "active",
      external_id: env.externalId ?? null,
      external_account: env.externalAccount ?? null,
      sender: env.sender ?? null,
      recipients: env.recipients ?? [],
      subject: env.subject ?? null,
      body_preview: preview(env),
      body_hash: bodyHash,
      raw_hash: rawHash,
      meta: meta as Prisma.InputJsonValue,
      sent_at: env.sentAt ? new Date(env.sentAt) : null,
      status: "received",
    },
    select: { id: true },
  });

  try {
    for (const att of env.attachments ?? []) {
      const buf = Buffer.from(att.dataBase64, "base64");
      const b = await storeBlob(target.orgId, buf, att.contentType);
      if (b.reused) blobsReused++;
      totalBytes += b.bytes;
      await prisma.attachments.create({
        data: {
          item_id: item.id,
          org_id: target.orgId,
          owner_user_id: target.ownerUserId,
          filename: att.filename ?? null,
          content_type: att.contentType ?? null,
          bytes: BigInt(buf.length),
          blob_hash: b.hash,
        },
      });
    }

    await prisma.items.update({
      where: { id: item.id },
      data: { status: "stored", bytes: BigInt(totalBytes) },
    });

    return {
      itemId: item.id,
      status: "stored",
      deduped: false,
      attachments: env.attachments?.length ?? 0,
      blobsReused,
      bytes: totalBytes,
    };
  } catch (e) {
    await prisma.items.update({
      where: { id: item.id },
      data: { status: "failed", error: String((e as Error)?.message ?? e).slice(0, 500) },
    });
    throw e;
  }
}

/** Read a stored blob back, transparently decompressing. */
export async function readBlob(orgId: string, hash: string): Promise<Buffer> {
  const row = await prisma.blobs.findFirst({
    where: { org_id: orgId, hash },
    select: { storage_path: true, encoding: true },
  });
  if (!row) throw new Error(`No blob ${hash} for org ${orgId}`);
  const buf = await getBlob(row.storage_path);
  return row.encoding === "gzip" ? gunzipSync(buf) : buf;
}
