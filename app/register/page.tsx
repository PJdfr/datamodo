import Link from "next/link";
import { signup } from "@/app/auth/actions";
import { OAuthButtons } from "@/components/oauth-buttons";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="muted">Start turning forwarded email into structured data.</p>

        <OAuthButtons />

        <div className="divider"><span>or</span></div>

        <form action={signup} className="auth-form">
          <label>
            Name
            <input type="text" name="fullName" autoComplete="name" />
          </label>
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
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Sign up
          </button>
        </form>

        {message === "check-email" && (
          <p className="form-success">
            Check your inbox to confirm your email, then log in.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}

        <p className="muted">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
