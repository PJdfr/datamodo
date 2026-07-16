// MCP bearer resolution — one place that answers "who is calling the MCP
// endpoint?" for every credential we accept:
//
//   1. LOCAL edition: nobody has to authenticate — one user, and the server
//      binds 127.0.0.1 by default, so reaching the port IS the auth boundary.
//   2. dmk_ HMAC tokens (mcp-token.ts) — stateless, zero-setup; what Claude
//      Code and any header-capable client uses.
//   3. dmo_ OAuth access tokens (oauth-store.ts) — what claude.ai connectors
//      get from the authorization-code + PKCE flow. DB-backed → revocable
//      per user; FAIL-SOFT so an unmigrated deployment keeps 1+2 working.
//
// Exported separately from the route so it's unit/integration-testable
// (route files may only export handlers).

// Relative .ts imports (not @/ aliases) so node:test can load this module
// directly (tests/oauth.test.ts) — Next resolves them identically.
import { verifyMcpToken, mcpTokenSecret } from "./mcp-token.ts";
import { isLocalMode, LOCAL_USER } from "../local/config.ts";

export interface McpAuthResult {
  token: string;
  scopes: string[];
  clientId: string;
  extra: { userId: string };
}

export async function resolveMcpBearer(bearer?: string): Promise<McpAuthResult | undefined> {
  if (isLocalMode()) {
    return { token: bearer ?? "local", scopes: ["vault"], clientId: LOCAL_USER.id, extra: { userId: LOCAL_USER.id } };
  }
  if (!bearer) return undefined;

  if (bearer.startsWith("dmo_")) {
    const { verifyOAuthAccessToken } = await import("./oauth-store");
    const grant = await verifyOAuthAccessToken(bearer);
    if (!grant) return undefined;
    return { token: bearer, scopes: [grant.scope], clientId: grant.userId, extra: { userId: grant.userId } };
  }

  const secret = mcpTokenSecret();
  if (!secret) return undefined;
  const userId = verifyMcpToken(bearer, secret);
  if (!userId) return undefined;
  return { token: bearer, scopes: ["vault"], clientId: userId, extra: { userId } };
}
