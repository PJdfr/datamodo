import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { mintMcpToken, mcpTokenSecret } from "@/lib/datamodo/mcp-token";

// The signed-in user's MCP connection details (Settings → "Connect Claude").
// The token is derived (mcp-token.ts) — showing it never writes anything.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const secret = mcpTokenSecret();
  if (!secret) return NextResponse.json({ error: "MCP is not configured on this deployment" }, { status: 501 });
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin;
  return NextResponse.json({
    url: `${base.replace(/\/$/, "")}/api/mcp/mcp`,
    token: mintMcpToken(user.id, secret),
  });
}
