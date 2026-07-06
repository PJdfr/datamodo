"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * Styled "Continue with Google" button for the auth screens. Uses the same
 * Supabase OAuth flow as the rest of the app; on success the browser is
 * redirected to Google, then back through /auth/callback.
 */
export function GoogleButton({
  next = "/dashboard",
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
    }
    // On success the browser navigates away to Google.
  }

  return (
    <>
      <button
        type="button"
        className="dm-auth-google"
        onClick={signIn}
        disabled={busy}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/google-gmail.svg" alt="" style={{ height: 17 }} />
        {busy ? "Redirecting…" : label}
      </button>
      {error && <p className="dm-auth-error">{error}</p>}
    </>
  );
}
