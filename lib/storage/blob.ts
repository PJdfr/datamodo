import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Object storage for the raw-message archive ("keep raw forever"). S3-compatible
// so it works with Neon Object Storage (its native API) or any S3/R2 bucket —
// configured entirely via AWS_* env vars. Replaces Supabase Storage.
//
// Env: AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
//      BLOB_BUCKET (bucket name; defaults to "ingest").

let _client: S3Client | null = null;

function client(): S3Client {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Object storage is not configured. Set AWS_ENDPOINT_URL_S3, AWS_REGION, " +
        "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (e.g. Neon Object Storage " +
        "credentials, or an R2/S3 bucket).",
    );
  }
  if (!_client) {
    _client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // Neon Storage / R2 use path-style addressing
    });
  }
  return _client;
}

function bucket(): string {
  return process.env.BLOB_BUCKET || "ingest";
}

/** Upload bytes at `key`. Content-addressed keys make this idempotent (an
 *  identical object simply overwrites itself). */
export async function putBlob(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType ?? "application/octet-stream",
    }),
  );
}

/** Download the object at `key` as a Buffer. */
export async function getBlob(key: string): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  if (!res.Body) throw new Error(`No object at ${key}`);
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}
