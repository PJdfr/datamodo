import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getOAuthClient } from "@/lib/datamodo/oauth-store";
import { signConsent, OAUTH_SCOPE } from "@/lib/datamodo/oauth";
import { mcpTokenSecret } from "@/lib/datamodo/mcp-token";
import { Logo } from "@/components/logo";

// The OAuth consent page — where a signed-in user approves an MCP client
// (claude.ai) connecting to their vault. Client + redirect_uri are validated
// BEFORE anything renders; a bad pair renders an error and never redirects
// (an unvalidated redirect would be an open redirect). The Approve form
// carries one signed field naming the exact grant shown (see
// app/api/oauth/approve) — nothing else is trusted from the POST.

export const dynamic = "force-dynamic";

type Params = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 12.5,
  color: "#3a352c",
  background: "#fff",
  border: "1px solid #e1d9c8",
  borderRadius: 8,
  padding: "3px 8px",
};

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="dm-auth">
      <div className="dm-auth-wrap" style={{ maxWidth: 480 }}>
        <div className="dm-auth-card">
          <div className="dm-auth-card-body">
            <div style={{ marginBottom: 30 }}>
              <Logo />
            </div>
            <h2 className="dm-auth-h2">{title}</h2>
            <p className="dm-auth-sub" style={{ marginBottom: 0 }}>{detail}</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;

  const secret = mcpTokenSecret();
  if (!secret) return <ErrorCard title="Connections aren't set up." detail="This deployment has no token secret configured, so it can't authorize clients." />;

  // 1. The client + redirect pair decides whether we may redirect AT ALL.
  const client = p.client_id ? await getOAuthClient(p.client_id).catch(() => null) : null;
  if (!client) {
    return <ErrorCard title="Unknown client." detail="This connection request names a client that isn't registered here. Go back to the app you were connecting and try again." />;
  }
  const redirectUri = p.redirect_uri ?? "";
  if (!client.redirectUris.includes(redirectUri)) {
    return <ErrorCard title="Redirect mismatch." detail="The request's redirect address isn't one this client registered — refusing to send you there." />;
  }

  // 2. Param errors AFTER validation may bounce back to the client, per spec.
  const bounce = (error: string) => {
    const to = new URL(redirectUri);
    to.searchParams.set("error", error);
    if (p.state) to.searchParams.set("state", p.state);
    redirect(to.toString());
  };
  if (p.response_type !== "code") bounce("unsupported_response_type");
  if (!p.code_challenge || (p.code_challenge_method ?? "S256") !== "S256") bounce("invalid_request");

  // 3. The user must be signed in to grant anything.
  const user = await getSessionUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(
      Object.entries(p).filter(([, v]) => typeof v === "string") as [string, string][],
    ).toString()}`;
    redirect(`/login?redirectTo=${encodeURIComponent(here)}`);
  }

  // Per-request server component (force-dynamic): each render mints a fresh
  // short-lived consent signature — Date.now() here is the point, not a bug.
  const consent = signConsent(
    {
      userId: user.id,
      clientId: client.clientId,
      redirectUri,
      codeChallenge: p.code_challenge!,
      scope: OAUTH_SCOPE,
      state: p.state ?? "",
      // eslint-disable-next-line react-hooks/purity
      exp: Date.now() + 10 * 60 * 1000,
    },
    secret,
  );

  const denyTo = new URL(redirectUri);
  denyTo.searchParams.set("error", "access_denied");
  if (p.state) denyTo.searchParams.set("state", p.state);

  return (
    <main className="dm-auth">
      <div className="dm-auth-wrap" style={{ maxWidth: 480 }}>
        <div className="dm-auth-card">
          <div className="dm-auth-card-body">
            <div style={{ marginBottom: 30 }}>
              <Logo />
            </div>
            <h2 className="dm-auth-h2">Connect to your vault?</h2>
            <p className="dm-auth-sub">
              <span style={mono}>{client.clientName}</span> is asking to use your datamodo vault as{" "}
              <span style={mono}>{user.email ?? user.id}</span>.
            </p>

            <div style={{ background: "#fbf8f1", border: "1px solid #ece5d8", borderRadius: 14, padding: "16px 18px", marginBottom: 22 }}>
              <div style={{ fontSize: 13.5, color: "#3a352c", lineHeight: 1.9 }}>
                <div><span style={{ color: "#e4593b" }}>✓</span> Read your entities, facts, documents and tables</div>
                <div><span style={{ color: "#e4593b" }}>✓</span> File new extractions through your review queue</div>
                <div><span style={{ color: "#e4593b" }}>✓</span> Resolve reviews you&apos;d otherwise click through</div>
                <div><span style={{ color: "#8a8477" }}>✗</span> No access to your account, keys or settings</div>
              </div>
            </div>

            <form action="/api/oauth/approve" method="POST">
              <input type="hidden" name="consent" value={consent} />
              <button type="submit" className="dm-auth-submit">Approve connection</button>
            </form>

            <p style={{ fontSize: 12, color: "#8a8477", marginTop: 14, lineHeight: 1.6 }}>
              You&apos;ll be sent back to <span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{new URL(redirectUri).host}</span>.
              Disconnect any time from that app — or ask us to revoke everything.
            </p>
          </div>
          <div className="dm-auth-foot">
            <a href={denyTo.toString()}>Deny and go back</a>
          </div>
        </div>
      </div>
    </main>
  );
}
