import { appBaseUrl } from "@/lib/datamodo/app-url";

// RFC 9728 protected-resource metadata: tells OAuth clients (claude.ai
// connectors) WHERE the MCP resource lives and WHICH authorization server
// (us) protects it. The optional catch-all also serves the path-suffixed
// form (/.well-known/oauth-protected-resource/api/mcp/mcp) some clients
// derive from the resource URL. Public document — permissive CORS.
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
      resource: `${base}/api/mcp/mcp`,
      authorization_servers: [base],
      scopes_supported: ["vault"],
      bearer_methods_supported: ["header"],
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
