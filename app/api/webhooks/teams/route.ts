import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createAdminClient } from "@/utils/supabase/admin";
import { ingest } from "@/lib/ingest/store";
import { isHandleBound, redeemChannelLinkCode } from "@/lib/datamodo/channels";
import type { IngestEnvelope } from "@/lib/ingest/types";

// Microsoft Teams inbound adapter (Azure Bot Service / Bot Framework). One
// shared bot serves every user; we identify the user by their AAD object id
// (activity.from.aadObjectId), bound once via a link code they message to the
// bot (see lib/datamodo/channels.ts).
export const runtime = "nodejs";

// Bot Framework signs every inbound request with a JWT. Validate it against
// Microsoft's published keys, with issuer + audience (= our bot's app id) checks.
// https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-connector-authentication
const BF_ISSUER = "https://api.botframework.com";
const BF_JWKS = createRemoteJWKSet(new URL("https://login.botframework.com/v1/keys"));

async function verifyBotToken(authHeader: string | null): Promise<boolean> {
  // Local-dev escape hatch — NEVER active in production. Lets us exercise the
  // capture/binding path without minting a real Bot Framework token.
  if (process.env.NODE_ENV !== "production" && process.env.TEAMS_DEV_SKIP_AUTH === "1") {
    return true;
  }
  const appId = process.env.MICROSOFT_APP_ID;
  if (!appId) return false;
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    await jwtVerify(token, BF_JWKS, { issuer: BF_ISSUER, audience: appId });
    return true;
  } catch {
    return false;
  }
}

interface TeamsActivity {
  type?: string;
  id?: string;
  text?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { id?: string; tenantId?: string };
  channelData?: { tenant?: { id?: string } };
  attachments?: { name?: string; contentType?: string; contentUrl?: string }[];
}

export async function POST(req: Request) {
  if (!(await verifyBotToken(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let activity: TeamsActivity;
  try {
    activity = (await req.json()) as TeamsActivity;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Only chat messages carry user content; ignore typing/conversationUpdate/etc.
  if (activity.type !== "message") return NextResponse.json({ ok: true });

  const handle = activity.from?.aadObjectId || activity.from?.id;
  if (!handle) return NextResponse.json({ ok: true });

  const text = activity.text ?? null;
  const admin = createAdminClient();

  const bound = await isHandleBound("teams", handle);
  if (!bound) {
    await redeemChannelLinkCode("teams", handle, text, {
      provider: "azure_bot",
      displayName: activity.from?.name,
    });
    // Unknown sender or just-bound: the activation message is not user content.
    return NextResponse.json({ ok: true });
  }

  // Teams attachment bytes live behind Graph/Bot auth; capture metadata now,
  // defer binary download to a later pass. Text is captured immediately.
  const envelope: IngestEnvelope = {
    channel: "teams",
    captureMode: "active",
    recipient: handle, // shared bot → resolve by sender
    externalId: activity.id ?? undefined,
    sender: activity.from?.name ?? handle,
    bodyText: text ?? undefined,
    meta: {
      aadObjectId: activity.from?.aadObjectId,
      tenantId: activity.channelData?.tenant?.id ?? activity.conversation?.tenantId,
      attachments: activity.attachments?.map((a) => ({
        name: a.name,
        contentType: a.contentType,
        contentUrl: a.contentUrl,
      })),
    },
  };

  try {
    await ingest(envelope);
  } catch (e) {
    console.error("[teams] ingest failed", e);
  }
  return NextResponse.json({ ok: true });
}
