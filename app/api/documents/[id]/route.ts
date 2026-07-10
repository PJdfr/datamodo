import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { prisma } from "@/lib/prisma";
import { readBlob } from "@/lib/ingest/store";

// Download the ORIGINAL file behind a `document` entity ("always keep the
// original"). The entity's natural key carries the blob hash
// ("doc:<blobHash>:<filename>"), so this resolves entity → blob → bytes,
// org-scoped at every step. 503 when the blob bucket isn't provisioned yet.
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const ent = await prisma.entities.findFirst({
    where: { id, org_id: org.id, kind: "document" },
    select: { natural_keys: true, canonical_label: true },
  });
  if (!ent) return NextResponse.json({ error: "document not found" }, { status: 404 });

  const key = (ent.natural_keys as Record<string, string> | null)?.id ?? "";
  const m = /^doc:([^:]+):/.exec(key);
  if (!m) return NextResponse.json({ error: "document has no stored original" }, { status: 404 });
  const blobHash = m[1];

  // The attachment row carries the real filename/content type; fall back to
  // the entity label if it predates attachment capture.
  const att = await prisma.attachments.findFirst({
    where: { org_id: org.id, blob_hash: blobHash },
    select: { filename: true, content_type: true },
  });
  const filename = att?.filename ?? ent.canonical_label ?? "document";
  const contentType = att?.content_type ?? "application/octet-stream";

  try {
    const bytes = await readBlob(org.id, blobHash);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        // ASCII-sanitized fallback name + RFC 5987 encoding for the real one.
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // Bucket not provisioned (env missing) or blob genuinely absent.
    const status = msg.includes("not configured") ? 503 : 404;
    return NextResponse.json(
      { error: status === 503 ? "file storage is not set up yet" : "original file unavailable" },
      { status },
    );
  }
}
