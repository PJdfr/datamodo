import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { mintMcpToken, mcpTokenSecret } from "@/lib/datamodo/mcp-token";
import { appBaseUrl } from "@/lib/datamodo/app-url";
import { isLocalMode } from "@/lib/local/config";

// The signed-in user's MCP connection details (Settings → "Connect Claude").
// GET: URL + HMAC token + the OAuth-connected apps (grants). DELETE: revoke a
// grant (?client_id=) or all of the user's grants — "disconnect Claude". The
// HMAC token is derived (mcp-token.ts) — showing it never writes anything.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = `${appBaseUrl(req)}/api/mcp/mcp`;
  const { listOAuthGrants } = await import("@/lib/datamodo/oauth-store");
  const grants = await listOAuthGrants(user.id); // fail-soft []
  // LOCAL edition: no token — one user, localhost is the auth boundary
  // (user call 2026-07-16). Claude connects with just the URL.
  if (isLocalMode()) return NextResponse.json({ url, token: null, authRequired: false, grants });
  const secret = mcpTokenSecret();
  if (!secret) return NextResponse.json({ error: "MCP is not configured on this deployment" }, { status: 501 });
  return NextResponse.json({ url, token: mintMcpToken(user.id, secret), authRequired: true, grants });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("client_id") ?? undefined;
  const { revokeOAuthGrants, listOAuthGrants } = await import("@/lib/datamodo/oauth-store");
  try {
    const revoked = await revokeOAuthGrants(user.id, clientId);
    return NextResponse.json({ ok: true, revoked, grants: await listOAuthGrants(user.id) });
  } catch (e) {
    console.error("[mcp-token] revoke failed", e);
    return NextResponse.json({ error: "could not revoke — try again" }, { status: 500 });
  }
}
