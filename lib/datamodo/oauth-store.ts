// OAuth storage (shell over prisma) — clients, single-use codes, and hashed
// bearer tokens for the MCP server. The pure rules live in oauth.ts; this
// module owns the rows. Everything is keyed by HASH — a leaked table yields
// no usable credential. Per-user revocation = delete the user's token rows
// (the thing the HMAC dmk_ tokens can't do).
//
// Requires migration neon/migrations/20260716150000_oauth.sql (tables ship in
// neon/schema.sql for fresh installs). verifyOAuthAccessToken is FAIL-SOFT so
// an unmigrated cloud deployment keeps its HMAC tokens working untouched.

import { prisma } from "@/lib/prisma";
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  OAUTH_SCOPE,
  REFRESH_TTL_MS,
  hashToken,
  pkceVerify,
  randomToken,
  type ClientRegistration,
} from "./oauth";

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

export async function registerOAuthClient(reg: ClientRegistration): Promise<OAuthClient> {
  const clientId = randomToken("dmc").replace(/^dmc_/, "cid_");
  await prisma.oauth_clients.create({
    data: { client_id: clientId, client_name: reg.clientName, redirect_uris: reg.redirectUris },
  });
  return { clientId, clientName: reg.clientName, redirectUris: reg.redirectUris };
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId) return null;
  const row = await prisma.oauth_clients.findUnique({ where: { client_id: clientId } });
  if (!row) return null;
  return {
    clientId: row.client_id,
    clientName: row.client_name,
    redirectUris: (row.redirect_uris as string[]) ?? [],
  };
}

/** Mint a single-use authorization code bound to client + redirect + PKCE. */
export async function createAuthCode(args: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
}): Promise<string> {
  const code = randomToken("dmc");
  await prisma.oauth_codes.create({
    data: {
      code_hash: hashToken(code),
      client_id: args.clientId,
      user_id: args.userId,
      redirect_uri: args.redirectUri,
      code_challenge: args.codeChallenge,
      scope: args.scope ?? OAUTH_SCOPE,
      expires_at: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  scope: string;
}

async function issueTokens(clientId: string, userId: string, scope: string): Promise<IssuedTokens> {
  const accessToken = randomToken("dmo");
  const refreshToken = randomToken("dmr");
  await prisma.oauth_tokens.create({
    data: {
      token_hash: hashToken(accessToken),
      refresh_hash: hashToken(refreshToken),
      client_id: clientId,
      user_id: userId,
      scope,
      access_expires_at: new Date(Date.now() + ACCESS_TTL_MS),
      refresh_expires_at: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken, expiresInSec: Math.floor(ACCESS_TTL_MS / 1000), scope };
}

/** RFC 6749 §4.1.3 + PKCE: consume the code (single-use — deleted on sight,
 *  valid or not) and issue tokens. Returns null on any mismatch. */
export async function exchangeAuthCode(args: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<IssuedTokens | null> {
  const codeHash = hashToken(args.code ?? "");
  // Delete-first makes reuse (and race replays) fail closed.
  const row = await prisma.oauth_codes.delete({ where: { code_hash: codeHash } }).catch(() => null);
  if (!row) return null;
  if (row.client_id !== args.clientId) return null;
  if (row.redirect_uri !== args.redirectUri) return null;
  if (row.expires_at.getTime() < Date.now()) return null;
  if (!pkceVerify(args.codeVerifier, row.code_challenge)) return null;
  return issueTokens(row.client_id, row.user_id, row.scope);
}

/** Rotate a refresh token: old pair dies (delete-first), new pair issued. */
export async function rotateRefreshToken(refreshToken: string, clientId: string): Promise<IssuedTokens | null> {
  const row = await prisma.oauth_tokens.delete({ where: { refresh_hash: hashToken(refreshToken ?? "") } }).catch(() => null);
  if (!row) return null;
  if (row.client_id !== clientId) return null;
  if (row.refresh_expires_at.getTime() < Date.now()) return null;
  return issueTokens(row.client_id, row.user_id, row.scope);
}

/** Bearer check for the MCP endpoint → the userId the token grants, or null.
 *  FAIL-SOFT: any storage error (e.g. migration not applied yet) is just
 *  "not an OAuth token" — the HMAC path stays unaffected. */
export async function verifyOAuthAccessToken(token: string): Promise<{ userId: string; scope: string } | null> {
  if (!token?.startsWith("dmo_")) return null;
  try {
    const row = await prisma.oauth_tokens.findUnique({ where: { token_hash: hashToken(token) } });
    if (!row) return null;
    if (row.access_expires_at.getTime() < Date.now()) return null;
    return { userId: row.user_id, scope: row.scope };
  } catch {
    return null;
  }
}

/** Housekeeping: drop expired codes + fully-expired token rows. Called
 *  opportunistically from the token endpoint; never awaited on the hot path. */
export async function pruneExpiredOAuthRows(): Promise<void> {
  const now = new Date();
  await prisma.oauth_codes.deleteMany({ where: { expires_at: { lt: now } } }).catch(() => {});
  await prisma.oauth_tokens.deleteMany({ where: { refresh_expires_at: { lt: now } } }).catch(() => {});
}

export interface OAuthGrant {
  clientId: string;
  clientName: string;
  /** Live token pairs for this client (usually 1; refresh rotation keeps it there). */
  tokens: number;
  /** When the newest pair was issued (ISO). */
  connectedAt: string;
}

/** The apps a user has connected via OAuth — what "Connected apps" in
 *  Settings shows. FAIL-SOFT to [] (unmigrated deployment / no grants). */
export async function listOAuthGrants(userId: string): Promise<OAuthGrant[]> {
  try {
    const rows = await prisma.oauth_tokens.findMany({
      where: { user_id: userId, refresh_expires_at: { gt: new Date() } },
      select: { client_id: true, created_at: true },
      orderBy: { created_at: "desc" },
    });
    if (rows.length === 0) return [];
    const byClient = new Map<string, { tokens: number; newest: Date }>();
    for (const r of rows) {
      const cur = byClient.get(r.client_id);
      if (cur) cur.tokens++;
      else byClient.set(r.client_id, { tokens: 1, newest: r.created_at });
    }
    const clients = await prisma.oauth_clients.findMany({
      where: { client_id: { in: [...byClient.keys()] } },
      select: { client_id: true, client_name: true },
    });
    const names = new Map(clients.map((c) => [c.client_id, c.client_name]));
    return [...byClient.entries()].map(([clientId, g]) => ({
      clientId,
      clientName: names.get(clientId) ?? "MCP client",
      tokens: g.tokens,
      connectedAt: g.newest.toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Revoke a user's OAuth access — one client's grants, or all of them. This
 *  is THE per-user revocation the stateless HMAC tokens can't offer: the
 *  deleted rows make every access AND refresh token dead on next use. */
export async function revokeOAuthGrants(userId: string, clientId?: string): Promise<number> {
  const res = await prisma.oauth_tokens.deleteMany({
    where: { user_id: userId, ...(clientId ? { client_id: clientId } : {}) },
  });
  // Any un-exchanged codes die with the grant too.
  await prisma.oauth_codes.deleteMany({
    where: { user_id: userId, ...(clientId ? { client_id: clientId } : {}) },
  }).catch(() => {});
  return res.count;
}
