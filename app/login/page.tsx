import Link from "next/link";
import { login } from "@/app/auth/actions";
import { OAuthButtons } from "@/components/oauth-buttons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const { error, redirectTo } = await searchParams;
  const next = redirectTo ?? "/dashboard";

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="muted">Welcome back to Datamodo.</p>

        <OAuthButtons next={next} />

        <div className="divider"><span>or</span></div>

        <form action={login} className="auth-form">
          <input type="hidden" name="redirectTo" value={next} />
          <label>
            Email
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Log in
          </button>
        </form>

        {error && <p className="form-error">{error}</p>}

        <p className="muted">
          No account? <Link href="/register">Create one</Link>
        </p>
      </div>
    </main>
  );
}
