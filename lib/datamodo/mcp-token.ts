// MCP bearer tokens — phase 1 of the MCP server (ROADMAP "run datamodo on a
// Claude subscription"). Tokens are DERIVED, not stored: HMAC(secret, userId)
// — verifiable with zero schema change, stateless on Vercel. Trade-off,
// documented: revocation is all-or-nothing (rotate MCP_TOKEN_SECRET); per-user
// revocation arrives with the OAuth phase. Secret precedence:
// MCP_TOKEN_SECRET → NEON_AUTH_COOKIE_SECRET (always set in real deployments).
// Pure except node:crypto — unit-tested.

import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (buf: Buffer) => buf.toString("base64url");

const sign = (userId: string, secret: string) =>
  b64url(createHmac("sha256", secret).update(`datamodo-mcp:${userId}`).digest());

/** Mint the user's MCP token: `dmk_<b64url(userId)>.<hmac>`. Deterministic —
 *  the same user always gets the same token under the same secret. */
export function mintMcpToken(userId: string, secret: string): string {
  if (!secret) throw new Error("MCP token secret not configured");
  return `dmk_${b64url(Buffer.from(userId, "utf8"))}.${sign(userId, secret)}`;
}

/** Verify a presented token → the userId it names, or null. Constant-time
 *  MAC comparison; malformed input never throws. */
export function verifyMcpToken(token: string, secret: string): string | null {
  if (!secret || !token.startsWith("dmk_")) return null;
  const dot = token.indexOf(".");
  if (dot < 5) return null;
  try {
    const userId = Buffer.from(token.slice(4, dot), "base64url").toString("utf8");
    if (!userId) return null;
    const given = Buffer.from(token.slice(dot + 1), "utf8");
    const expected = Buffer.from(sign(userId, secret), "utf8");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return userId;
  } catch {
    return null;
  }
}

/** The secret in effect for this deployment ("" = feature disabled). */
export function mcpTokenSecret(): string {
  return process.env.MCP_TOKEN_SECRET?.trim() || process.env.NEON_AUTH_COOKIE_SECRET?.trim() || "";
}
