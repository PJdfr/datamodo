import { teamsHandle } from "./handles";
import { verifyJwt } from "./jwt";
import type { InboundMessage, ReplyFn } from "./inbound";

// Microsoft Teams adapter (Azure Bot Service / Bot Framework). One bot app is the
// shared bot; a user chats it. Inbound arrives as a Bot Framework "Activity" POST
// carrying a Bearer JWT issued by the Bot Framework token service; we verify that
// against the channel JWKS. Replies go back through the Connector API, authorized
// with a client-credentials token minted from the bot's app id + password.

// Public Azure channel-auth endpoints (see Bot Framework auth docs).
const OPENID_CONFIG = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const ISSUER = "https://api.botframework.com";
const TOKEN_URL = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";
const CONNECTOR_SCOPE = "https://api.botframework.com/.default";

/** Authenticate the request: verify the Bearer JWT is a Bot Framework token
 *  addressed to our app. Returns true only if the signature and claims check out. */
export async function verifyRequest(authHeader: string | null): Promise<boolean> {
  const appId = process.env.TEAMS_APP_ID;
  if (!appId || !authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  const payload = await verifyJwt(token, { openIdConfigUrl: OPENID_CONFIG, issuer: ISSUER, audience: appId });
  return payload !== null;
}

interface Activity {
  type?: string;
  id?: string;
  timestamp?: string;
  text?: string;
  serviceUrl?: string;
  channelId?: string;
  from?: { id: string; name?: string; aadObjectId?: string };
  conversation?: { id: string };
  recipient?: { id: string; name?: string };
}

/** Normalize a verified Activity into an InboundMessage (message activities only). */
export function parseActivity(body: unknown): InboundMessage[] {
  const a = body as Activity;
  if (a.type !== "message" || !a.from?.id || !a.text) return [];
  return [{
    handle: teamsHandle(a.from.aadObjectId, a.from.id),
    displayName: a.from.name,
    externalId: a.id,
    botAccount: a.recipient?.id,
    text: a.text,
    sentAt: a.timestamp,
    // serviceUrl + conversation id are what the reply needs; keep them on meta.
    meta: { serviceUrl: a.serviceUrl, conversationId: a.conversation?.id, channelId: a.channelId },
  }];
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function connectorToken(): Promise<string | null> {
  const appId = process.env.TEAMS_APP_ID;
  const password = process.env.TEAMS_APP_PASSWORD;
  if (!appId || !password) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: password,
      scope: CONNECTOR_SCOPE,
    }),
  });
  if (!res.ok) return null;
  const tok = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!tok.access_token) return null;
  cachedToken = { value: tok.access_token, expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000 - 60_000 };
  return tok.access_token;
}

/** Post a reply back into the originating conversation via the Connector API. */
export const reply: ReplyFn = async (msg, text) => {
  const serviceUrl = msg.meta?.serviceUrl as string | undefined;
  const conversationId = msg.meta?.conversationId as string | undefined;
  if (!serviceUrl || !conversationId) return;
  const token = await connectorToken();
  if (!token) return;
  const base = serviceUrl.replace(/\/$/, "");
  await fetch(`${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "message", text }),
  });
};
