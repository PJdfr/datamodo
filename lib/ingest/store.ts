import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import type { IngestEnvelope, IngestResult } from "./types";

const BUCKET = "ingest";
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
async function resolveTarget(
  admin: SupabaseClient,
  env: IngestEnvelope,
): Promise<Target> {
  if (env.orgId) {
    return { orgId: env.orgId, ownerUserId: env.ownerUserId ?? null, sourceId: null };
  }
  const handle = env.recipient?.trim();
  if (!handle) {
    throw new IngestError("NO_ROUTING", "envelope needs orgId or recipient", 400);
  }

  if (env.channel === "email") {
    const addr = handle.toLowerCase();
    const { data, error } = await admin
      .from("forwarding_addresses")
      .select("id, org_id, owner_user_id")
      .eq("address", addr)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return {
        orgId: data.org_id,
        ownerUserId: data.owner_user_id,
        sourceId: null,
        forwardingAddressId: data.id,
      };
    }
  }

  const { data: src, error: srcErr } = await admin
    .from("ingest_sources")
    .select("id, org_id, owner_user_id")
    .eq("channel", env.channel)
    .eq("handle", handle)
    .maybeSingle();
  if (srcErr) throw srcErr;
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
  admin: SupabaseClient,
  orgId: string,
  bytes: Buffer,
  contentType?: string,
): Promise<StoredBlob> {
  const hash = createHash("sha256").update(bytes).digest("hex");

  const { data: existing, error: selErr } = await admin
    .from("blobs")
    .select("hash")
    .eq("org_id", orgId)
    .eq("hash", hash)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return { hash, reused: true, bytes: bytes.length };

  const gz = gzipSync(bytes);
  const useGzip = gz.length < bytes.length;
  const payload = useGzip ? gz : bytes;
  const encoding = useGzip ? "gzip" : "identity";
  const path = `${orgId}/${hash.slice(0, 2)}/${hash}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, payload, {
      contentType: useGzip ? "application/gzip" : contentType ?? "application/octet-stream",
      upsert: false,
    });
  // Content-addressed path: an "already exists" error means a concurrent
  // ingest stored the identical bytes — that's fine.
  if (upErr && !/exists|duplicate/i.test(upErr.message)) throw upErr;

  const { error: insErr } = await admin.from("blobs").insert({
    org_id: orgId,
    hash,
    storage_path: path,
    bytes: bytes.length,
    stored_bytes: payload.length,
    encoding,
    content_type: contentType ?? null,
  });
  // Unique (org_id, hash) violation → another writer won the race; harmless.
  if (insErr && insErr.code !== "23505") throw insErr;

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
  const admin = createAdminClient();
  const target = await resolveTarget(admin, env);

  // Idempotency: same provider message id per org+channel is captured once.
  if (env.externalId) {
    const { data: dup, error } = await admin
      .from("items")
      .select("id, bytes")
      .eq("org_id", target.orgId)
      .eq("channel", env.channel)
      .eq("external_id", env.externalId)
      .maybeSingle();
    if (error) throw error;
    if (dup) {
      return {
        itemId: dup.id,
        status: "stored",
        deduped: true,
        attachments: 0,
        blobsReused: 0,
        bytes: dup.bytes,
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
    const b = await storeBlob(admin, target.orgId, buf, "application/json");
    bodyHash = b.hash;
    if (b.reused) blobsReused++;
    totalBytes += b.bytes;
  }

  // Raw provider payload (e.g. full .eml), kept verbatim for fidelity.
  let rawHash: string | null = null;
  if (env.raw?.dataBase64) {
    const buf = Buffer.from(env.raw.dataBase64, "base64");
    const b = await storeBlob(admin, target.orgId, buf, env.raw.contentType);
    rawHash = b.hash;
    if (b.reused) blobsReused++;
    totalBytes += b.bytes;
  }

  const meta = { ...(env.meta ?? {}) } as Record<string, unknown>;
  if (target.forwardingAddressId) meta.forwarding_address_id = target.forwardingAddressId;

  const { data: item, error: itemErr } = await admin
    .from("items")
    .insert({
      org_id: target.orgId,
      owner_user_id: target.ownerUserId,
      source_id: target.sourceId,
      channel: env.channel,
      capture_mode: env.captureMode ?? "active",
      external_id: env.externalId ?? null,
      external_account: env.externalAccount ?? null,
      sender: env.sender ?? null,
      recipients: env.recipients ?? null,
      subject: env.subject ?? null,
      body_preview: preview(env),
      body_hash: bodyHash,
      raw_hash: rawHash,
      meta,
      source_ref: env.sourceRef ?? {},
      sent_at: env.sentAt ?? null,
      status: "received",
    })
    .select("id")
    .single();
  if (itemErr) throw itemErr;

  try {
    for (const att of env.attachments ?? []) {
      const buf = Buffer.from(att.dataBase64, "base64");
      const b = await storeBlob(admin, target.orgId, buf, att.contentType);
      if (b.reused) blobsReused++;
      totalBytes += b.bytes;
      const { error: attErr } = await admin.from("attachments").insert({
        item_id: item.id,
        org_id: target.orgId,
        owner_user_id: target.ownerUserId,
        filename: att.filename ?? null,
        content_type: att.contentType ?? null,
        bytes: buf.length,
        blob_hash: b.hash,
      });
      if (attErr) throw attErr;
    }

    await admin
      .from("items")
      .update({ status: "stored", bytes: totalBytes })
      .eq("id", item.id);

    return {
      itemId: item.id,
      status: "stored",
      deduped: false,
      attachments: env.attachments?.length ?? 0,
      blobsReused,
      bytes: totalBytes,
    };
  } catch (e) {
    await admin
      .from("items")
      .update({ status: "failed", error: String((e as Error)?.message ?? e).slice(0, 500) })
      .eq("id", item.id);
    throw e;
  }
}

/** Read a stored blob back, transparently decompressing. */
export async function readBlob(
  orgId: string,
  hash: string,
  admin: SupabaseClient = createAdminClient(),
): Promise<Buffer> {
  const { data: row, error } = await admin
    .from("blobs")
    .select("storage_path, encoding")
    .eq("org_id", orgId)
    .eq("hash", hash)
    .single();
  if (error) throw error;
  const { data, error: dlErr } = await admin.storage.from(BUCKET).download(row.storage_path);
  if (dlErr) throw dlErr;
  const buf = Buffer.from(await data.arrayBuffer());
  return row.encoding === "gzip" ? gunzipSync(buf) : buf;
}
