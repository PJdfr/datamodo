import { redirect } from "next/navigation";
import Link from "next/link";
import { signup } from "@/app/auth/actions";
import { Logo } from "@/components/logo";
import { GoogleButton } from "@/components/google-button";
import { BrandAside } from "@/components/brand-aside";
import { MailIcon, LockIcon, UserIcon } from "@/components/field-icons";
import { isLocalMode } from "@/lib/local/config";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  if (isLocalMode()) redirect("/dashboard");
  const { error, message } = await searchParams;

  return (
    <main className="dm-auth">
      <div className="dm-auth-wrap">
        <div className="dm-auth-card">
          <div className="dm-auth-card-body">
            <div style={{ marginBottom: 34 }}>
              <Logo />
            </div>
            <h2 className="dm-auth-h2">Start your second brain.</h2>
            <p className="dm-auth-sub">Free to try. No card needed.</p>

            <GoogleButton label="Sign up with Google" />

            <div className="dm-auth-or">
              <span>or</span>
            </div>

            <form action={signup}>
              <label className="dm-auth-label" htmlFor="fullName">
                Full name
              </label>
              <div className="dm-auth-field">
                <span className="glyph">
                  <UserIcon />
                </span>
                <input
                  id="fullName"
                  type="text"
                  name="fullName"
                  autoComplete="name"
                  placeholder="Alex Rivera"
                />
              </div>

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
                  placeholder="alex@company.com"
                />
              </div>

              <label className="dm-auth-label" htmlFor="password">
                Password
              </label>
              <div className="dm-auth-field" style={{ marginBottom: 22 }}>
                <span className="glyph">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </div>

              <button type="submit" className="dm-auth-submit">
                Create account
              </button>
              <p className="dm-auth-terms">
                By continuing you agree to our Terms &amp; Privacy Policy.
              </p>
            </form>

            {message === "check-email" && (
              <p className="dm-auth-success">
                Check your inbox to confirm your email, then sign in.
              </p>
            )}
            {error && <p className="dm-auth-error">{error}</p>}
          </div>

          <div className="dm-auth-foot">
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>

        <BrandAside />
      </div>
    </main>
  );
}
