// OAuth 2.1 primitives for the MCP server (phase 3 — claude.ai connectors).
//
// datamodo is BOTH the resource server (/api/mcp) and the authorization
// server: clients register dynamically (RFC 7591), get sent to a consent
// page, and exchange an authorization code + PKCE verifier (RFC 7636, S256
// only) for opaque bearer tokens. Tokens are random and stored HASHED —
// the DB never holds a usable credential (lib/datamodo/oauth-store.ts owns
// storage; this module is pure except node:crypto and unit-tested).
//
// The pre-existing HMAC tokens (mcp-token.ts) keep working side by side —
// they serve Claude Code / header-capable clients with zero setup.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_SCOPE = "vault";
/** Access tokens live two weeks; refresh rotates on every use. */
export const ACCESS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const REFRESH_TTL_MS = 180 * 24 * 60 * 60 * 1000;
/** Codes are single-use and short-lived. */
export const CODE_TTL_MS = 10 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Random opaque credential. Prefixes make leaked strings identifiable:
 *  dmo_ = access token · dmr_ = refresh token · dmc_ = authorization code. */
export function randomToken(prefix: "dmo" | "dmr" | "dmc"): string {
  return `${prefix}_${b64url(randomBytes(32))}`;
}

/** Storage form of any credential — sha256 hex. Lookups compare hashes, so a
 *  DB leak yields nothing usable. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** RFC 7636 S256: challenge = b64url(sha256(ascii(verifier))). */
export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

/** Constant-time challenge check; malformed input is just "no". */
export function pkceVerify(verifier: string | undefined, challenge: string | undefined): boolean {
  if (!verifier || !challenge) return false;
  if (verifier.length < 43 || verifier.length > 128) return false;
  const a = Buffer.from(pkceChallenge(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A registerable redirect URI: https anywhere, or http on loopback only
 *  (native-app flows). Exact-match against the registered list at authorize
 *  time — no prefix/subdomain matching. */
export function isValidRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  if (u.protocol !== "http:") return false;
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]" || u.hostname === "::1";
}

export interface ClientRegistration {
  clientName: string;
  redirectUris: string[];
}

/** Validate an RFC 7591 registration request body → normalized registration,
 *  or a human error string. */
export function parseClientRegistration(body: unknown): ClientRegistration | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0) return { error: "redirect_uris is required (a non-empty array of exact redirect URIs)" };
  if (uris.length > 10) return { error: "too many redirect_uris (max 10)" };
  for (const u of uris) {
    if (u.length > 2000 || !isValidRedirectUri(u)) return { error: `invalid redirect_uri: ${u.slice(0, 120)} (https required — http only on localhost)` };
  }
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 120) : "MCP client";
  return { clientName: name, redirectUris: [...new Set(uris)] };
}

/* ------------------------------------------------------------------ */
/* Consent form signing — the approve POST must originate from OUR      */
/* consent page (CSRF: a cross-site form post could otherwise silently  */
/* grant an attacker's client access to a signed-in user's vault).      */
/* ------------------------------------------------------------------ */

export interface ConsentPayload {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string;
  /** unix ms — consent forms expire quickly. */
  exp: number;
}

const consentMac = (json: string, secret: string) =>
  b64url(createHmac("sha256", secret).update(`datamodo-oauth-consent:${json}`).digest());

/** Sign the exact grant the consent page displayed. */
export function signConsent(payload: ConsentPayload, secret: string): string {
  if (!secret) throw new Error("OAuth consent secret not configured");
  const json = JSON.stringify(payload);
  return `${b64url(Buffer.from(json, "utf8"))}.${consentMac(json, secret)}`;
}

/** Verify a consent token → its payload, or null (bad MAC / expired / malformed). */
export function verifyConsent(token: string, secret: string, now = Date.now()): ConsentPayload | null {
  if (!secret || !token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  try {
    const json = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    const given = Buffer.from(token.slice(dot + 1), "utf8");
    const expected = Buffer.from(consentMac(json, secret), "utf8");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(json) as ConsentPayload;
    if (!payload.userId || !payload.clientId || !payload.redirectUri || !payload.codeChallenge) return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
