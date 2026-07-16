import { appBaseUrl } from "@/lib/datamodo/app-url";

// RFC 8414 authorization-server metadata: datamodo is its own authorization
// server for the MCP endpoint. PKCE S256 only, public clients only (no
// secrets — token_endpoint_auth "none"), dynamic registration open. The
// optional catch-all serves path-suffixed discovery forms too. Public
// document — permissive CORS.
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version",
};

export async function GET(req: Request) {
  const base = appBaseUrl(req);
  return Response.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["vault"],
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
