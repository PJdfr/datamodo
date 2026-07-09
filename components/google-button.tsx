"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * Styled "Continue with Google" button for the auth screens. Uses Neon Auth
 * (Better Auth) social sign-in; on success the browser is redirected to Google,
 * then back to `next` via the /api/auth callback handled by Neon Auth.
 */
export function GoogleButton({
  next = "/dashboard",
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
    });
    if (error) {
      setBusy(false);
      setError(error.message ?? "Google sign-in failed");
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
