import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { simpleParser } from "mailparser";
import { ingest, IngestError } from "@/lib/ingest/store";
import { kickExtraction } from "@/lib/ingest/kick";
import { parsedMailToEnvelope, type ParsedMailLike } from "@/lib/local/connectors/imap";
import { getSessionUser, getOrCreateOrg } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/local/config";

// Parsing a raw .eml (mailparser) + the extraction kick need the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

/** The local IMAP poller (bin/datamodo.mjs) downloads each new message's raw
 *  source and POSTs it here. This route only exists in the LOCAL edition — it's
 *  the pull-side counterpart to the cloud email webhook. Body shape:
 *    { connectorId, user, uid, rawBase64 } */
interface ImapSyncBody {
  connectorId?: string;
  user?: string;
  uid?: number;
  rawBase64?: string;
}

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_WEBHOOK_SECRET;
  const provided = req.headers.get("x-ingest-secret") ?? "";
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // Local-only: the cloud edition captures email through the hosted worker.
  if (!isLocalMode()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ImapSyncBody;
  try {
    body = (await req.json()) as ImapSyncBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { connectorId, user, uid, rawBase64 } = body;
  if (!connectorId || typeof uid !== "number" || !rawBase64) {
    return NextResponse.json({ error: "connectorId, uid and rawBase64 are required" }, { status: 400 });
  }

  try {
    const raw = Buffer.from(rawBase64, "base64");
    const mail = (await simpleParser(raw)) as unknown as ParsedMailLike;
    const env = parsedMailToEnvelope(mail, {
      connector: { id: connectorId, user: user ?? "" },
      uid,
      rawBase64,
    });

    // Single-user edition: everything belongs to the one local org. Resolve it
    // here (provisioning on first pull if the user hasn't opened the dashboard
    // yet) so the shared capture core needs no routing.
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "no local user" }, { status: 500 });
    }
    const org = await getOrCreateOrg(sessionUser);
    env.orgId = org.id;
    env.ownerUserId = sessionUser.id;

    const result = await ingest(env);
    if (!result.deduped) kickExtraction();
    return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
  } catch (e) {
    if (e instanceof IngestError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    console.error("[imap-sync] failed", e);
    return NextResponse.json({ error: "ingestion failed" }, { status: 500 });
  }
}
