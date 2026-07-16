// LOCAL EDITION build of lib/storage/blob.ts — filesystem only. The cloud
// edition's S3/R2 client is closed-layer and not part of this package;
// scripts/build-local-package.mjs swaps this file in. Same chokepoint API
// (putBlob/getBlob), same content-addressed keys — they just become file
// paths under BLOB_DIR (~/.datamodo/blobs), which `datamodo serve` always sets.

import { putBlobFs, getBlobFs } from "./blob-fs";

function assertConfigured(): void {
  if (!process.env.BLOB_DIR?.trim()) {
    throw new Error("Blob storage is not configured — BLOB_DIR is unset (datamodo serve sets it; set it yourself for custom setups).");
  }
}

/** Store bytes at `key`. Content-addressed keys make this idempotent. */
export async function putBlob(key: string, body: Buffer, _contentType?: string): Promise<void> {
  assertConfigured();
  await putBlobFs(key, body);
}

/** Read the bytes stored at `key`. */
export async function getBlob(key: string): Promise<Buffer> {
  assertConfigured();
  return getBlobFs(key);
}
