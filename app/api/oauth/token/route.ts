import { NextResponse } from "next/server";
import { exchangeAuthCode, rotateRefreshToken, pruneExpiredOAuthRows } from "@/lib/datamodo/oauth-store";

// RFC 6749 token endpoint (public clients + PKCE only):
//   grant_type=authorization_code  code · redirect_uri · client_id · code_verifier
//   grant_type=refresh_token       refresh_token · client_id   (rotating)
// Accepts form-encoded (the spec) and JSON (lenient clients). Errors use the
// RFC's {error} shape — invalid_grant deliberately never says WHICH check
// failed (code reuse, wrong verifier, wrong client, expiry all look alike).
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

async function params(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(j as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]));
  }
  const form = await req.formData().catch(() => null);
  if (!form) return {};
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

const err = (error: string, description?: string, status = 400) =>
  NextResponse.json({ error, ...(description ? { error_description: description } : {}) }, { status, headers: CORS });

export async function POST(req: Request) {
  const p = await params(req);

  // Housekeeping rides along, never awaited on the response path.
  void pruneExpiredOAuthRows();

  try {
    if (p.grant_type === "authorization_code") {
      if (!p.code || !p.client_id || !p.redirect_uri || !p.code_verifier) {
        return err("invalid_request", "code, client_id, redirect_uri and code_verifier are required");
      }
      const tokens = await exchangeAuthCode({
        code: p.code,
        clientId: p.client_id,
        redirectUri: p.redirect_uri,
        codeVerifier: p.code_verifier,
      });
      if (!tokens) return err("invalid_grant");
      return NextResponse.json(
        {
          access_token: tokens.accessToken,
          token_type: "Bearer",
          expires_in: tokens.expiresInSec,
          refresh_token: tokens.refreshToken,
          scope: tokens.scope,
        },
        { headers: { ...CORS, "cache-control": "no-store" } },
      );
    }

    if (p.grant_type === "refresh_token") {
      if (!p.refresh_token || !p.client_id) return err("invalid_request", "refresh_token and client_id are required");
      const tokens = await rotateRefreshToken(p.refresh_token, p.client_id);
      if (!tokens) return err("invalid_grant");
      return NextResponse.json(
        {
          access_token: tokens.accessToken,
          token_type: "Bearer",
          expires_in: tokens.expiresInSec,
          refresh_token: tokens.refreshToken,
          scope: tokens.scope,
        },
        { headers: { ...CORS, "cache-control": "no-store" } },
      );
    }

    return err("unsupported_grant_type");
  } catch (e) {
    console.error("[oauth] token endpoint failed", e);
    return err("server_error", "token storage failed — is the oauth migration applied?", 500);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
