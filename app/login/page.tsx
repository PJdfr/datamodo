import Link from "next/link";
import { login } from "@/app/auth/actions";
import { Logo } from "@/components/logo";
import { GoogleButton } from "@/components/google-button";
import { BrandAside } from "@/components/brand-aside";
import { MailIcon, LockIcon } from "@/components/field-icons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const { error, redirectTo } = await searchParams;
  const next = redirectTo ?? "/dashboard";

  return (
    <main className="dm-auth">
      <div className="dm-auth-wrap">
        <div className="dm-auth-card">
          <div className="dm-auth-card-body">
            <div style={{ marginBottom: 34 }}>
              <Logo />
            </div>
            <h2 className="dm-auth-h2">Welcome back.</h2>
            <p className="dm-auth-sub">Sign in to your second brain.</p>

            <GoogleButton next={next} label="Continue with Google" />

            <div className="dm-auth-or">
              <span>or</span>
            </div>

            <form action={login}>
              <input type="hidden" name="redirectTo" value={next} />

              <label className="dm-auth-label" htmlFor="email">
                Email
              </label>
              <div className="dm-auth-field">
                <span className="glyph">
                  <MailIcon />
                </span>
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <label className="dm-auth-label" htmlFor="password" style={{ marginBottom: 0 }}>
                  Password
                </label>
                <a href="#" className="dm-auth-forgot">
                  Forgot?
                </a>
              </div>
              <div className="dm-auth-field" style={{ marginBottom: 24 }}>
                <span className="glyph">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>

              <button type="submit" className="dm-auth-submit">
                Sign in
              </button>
            </form>

            {error && <p className="dm-auth-error">{error}</p>}
          </div>

          <div className="dm-auth-foot">
            New here? <Link href="/register">Create an account</Link>
          </div>
        </div>

        <BrandAside />
      </div>
    </main>
  );
}
