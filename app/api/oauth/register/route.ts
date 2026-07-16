import { NextResponse } from "next/server";
import { parseClientRegistration } from "@/lib/datamodo/oauth";
import { registerOAuthClient } from "@/lib/datamodo/oauth-store";

// RFC 7591 dynamic client registration — how claude.ai (and any MCP client)
// introduces itself before the authorize flow. Open registration, PUBLIC
// clients only: no secret is issued, PKCE is what binds the flow. A rogue
// registration gains nothing — every grant still walks through the signed-in
// user's consent page.
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "body must be JSON" }, { status: 400, headers: CORS });
  }
  const reg = parseClientRegistration(body);
  if ("error" in reg) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: reg.error }, { status: 400, headers: CORS });
  }
  try {
    const client = await registerOAuthClient(reg);
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      { status: 201, headers: CORS },
    );
  } catch (e) {
    console.error("[oauth] client registration failed", e);
    return NextResponse.json(
      { error: "server_error", error_description: "registration storage failed — is the oauth migration applied?" },
      { status: 500, headers: CORS },
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
