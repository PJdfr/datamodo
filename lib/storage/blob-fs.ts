// LOCAL EDITION blob storage — the filesystem writer behind the SAME
// putBlob/getBlob interface as the S3 adapter (blob.ts dispatches to this when
// BLOB_DIR is set). Content-addressed keys already dedupe; here they just
// become file paths under the local data dir. No cloud, no credentials.
//
// Keys can contain "/" (they're content-hash paths) — we mirror that into
// nested directories, but sanitize each segment so a crafted key can never
// escape the blob root (traversal-proof, like the folder-export zip writer).

import { promises as fs } from "node:fs";
import path from "node:path";

function blobRoot(): string {
  const dir = process.env.BLOB_DIR?.trim();
  if (!dir) throw new Error("Local blob storage: BLOB_DIR is not set");
  return dir;
}

/** Resolve a key to an absolute path UNDER the blob root, refusing traversal. */
function pathFor(key: string): string {
  const safe = key
    .split("/")
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  const root = path.resolve(blobRoot());
  const full = path.resolve(root, safe);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Local blob storage: key escapes the blob root");
  }
  return full;
}

export async function putBlobFs(key: string, body: Buffer): Promise<void> {
  const full = pathFor(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

export async function getBlobFs(key: string): Promise<Buffer> {
  try {
    return await fs.readFile(pathFor(key));
  } catch {
    throw new Error(`No object at ${key}`);
  }
}
