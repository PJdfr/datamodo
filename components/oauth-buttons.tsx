"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type OAuthProvider = "google" | "github" | "apple";

const PROVIDERS: { provider: OAuthProvider; label: string }[] = [
  { provider: "google", label: "Continue with Google" },
  { provider: "github", label: "Continue with GitHub" },
  { provider: "apple", label: "Continue with Apple" },
];

export function OAuthButtons({ next = "/dashboard" }: { next?: string }) {
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [ssoDomain, setSsoDomain] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function signInWithProvider(provider: OAuthProvider) {
    setBusy(provider);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setBusy(null);
      setError(error.message);
    }
    // On success the browser is redirected to the provider.
  }

  async function signInWithSSO(e: React.FormEvent) {
    e.preventDefault();
    if (!ssoDomain.trim()) return;
    setBusy("sso");
    setError(null);
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: ssoDomain.trim(),
    });
    if (error) {
      setBusy(null);
      setError(error.message);
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  return (
    <div className="oauth">
      {PROVIDERS.map(({ provider, label }) => (
        <button
          key={provider}
          type="button"
          className="btn btn-outline"
          disabled={busy !== null}
          onClick={() => signInWithProvider(provider)}
        >
          {busy === provider ? "Redirecting…" : label}
        </button>
      ))}

      <form className="sso" onSubmit={signInWithSSO}>
        <input
          type="text"
          placeholder="company.com (SSO)"
          value={ssoDomain}
          onChange={(e) => setSsoDomain(e.target.value)}
          aria-label="SSO organization domain"
        />
        <button type="submit" className="btn btn-outline" disabled={busy !== null}>
          {busy === "sso" ? "…" : "SSO"}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
