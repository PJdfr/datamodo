import { getSessionUser } from "@/lib/auth/session";
import { verifyConsent } from "@/lib/datamodo/oauth";
import { mcpTokenSecret } from "@/lib/datamodo/mcp-token";
import { createAuthCode } from "@/lib/datamodo/oauth-store";

// The consent page's Approve action. The form carries ONE field: a signed
// consent token naming the exact grant the page displayed (client, redirect,
// PKCE challenge, user, short expiry) — so a cross-site form post can't forge
// a grant (CSRF), and what the user saw is byte-for-byte what gets approved.
// The session user must still match the token's user.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const consent = String(form?.get("consent") ?? "");
  const payload = verifyConsent(consent, mcpTokenSecret());
  if (!payload) {
    return new Response("This consent form has expired — go back to Claude and connect again.", { status: 400 });
  }
  const user = await getSessionUser();
  if (!user || user.id !== payload.userId) {
    return new Response("Session changed — sign in and connect again.", { status: 403 });
  }

  const code = await createAuthCode({
    clientId: payload.clientId,
    userId: payload.userId,
    redirectUri: payload.redirectUri,
    codeChallenge: payload.codeChallenge,
    scope: payload.scope,
  });

  const to = new URL(payload.redirectUri);
  to.searchParams.set("code", code);
  if (payload.state) to.searchParams.set("state", payload.state);
  return Response.redirect(to.toString(), 303);
}
