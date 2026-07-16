import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { mintMcpToken, mcpTokenSecret } from "@/lib/datamodo/mcp-token";
import { isLocalMode } from "@/lib/local/config";

// The signed-in user's MCP connection details (Settings → "Connect Claude").
// The token is derived (mcp-token.ts) — showing it never writes anything.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin;
  const url = `${base.replace(/\/$/, "")}/api/mcp/mcp`;
  // LOCAL edition: no token — one user, localhost is the auth boundary
  // (user call 2026-07-16). Claude connects with just the URL.
  if (isLocalMode()) return NextResponse.json({ url, token: null, authRequired: false });
  const secret = mcpTokenSecret();
  if (!secret) return NextResponse.json({ error: "MCP is not configured on this deployment" }, { status: 501 });
  return NextResponse.json({ url, token: mintMcpToken(user.id, secret), authRequired: true });
}
