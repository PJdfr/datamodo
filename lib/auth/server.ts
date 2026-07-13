import { createNeonAuth } from "@neondatabase/auth/next/server";

// Server-side Neon Auth (Better Auth) instance. Provides .handler() for the
// /api/auth route, .middleware() for route protection, and .getSession() +
// sign-in/up/out for server actions & server components. Replaces the Supabase
// SSR auth client.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    // Neon Auth defaults the session cookie to SameSite=Strict, which withholds
    // it whenever a tab is reached via a context the browser deems cross-site
    // (a freshly opened tab from an editor/terminal, a restored tab, an external
    // link). That tab then loads without the cookie, so client fetches to
    // /api/* return 401 and no data renders. `lax` — the browser default and the
    // standard choice for session cookies — is sent on top-level navigations
    // while still blocking cross-site state-changing subrequests.
    sameSite: "lax",
  },
});
