import type { createNeonAuth } from "@neondatabase/auth/next/server";

// Server-side Neon Auth (Better Auth). Provides .handler() for the /api/auth
// route, .middleware() for route protection, and .getSession() + sign-in/up/out
// for server actions & server components.
//
// LAZY BY DESIGN. The instance is built on first use, NOT at module load,
// because createNeonAuth reads NEON_AUTH_* env and throws without it. Deferring
// it means:
//   • the BUILD never needs those secrets — importing a route module during
//     page-data collection no longer evaluates createNeonAuth; and
//   • the LOCAL edition (no cloud auth at all) never constructs better-auth,
//     and the SDK loads as its own dynamic chunk that local code never runs.
// Only the cloud runtime, on the first real auth call, builds it.

type NeonAuth = ReturnType<typeof createNeonAuth>;

let cached: NeonAuth | null = null;

export async function getAuth(): Promise<NeonAuth> {
  if (cached) return cached;
  const { createNeonAuth } = await import("@neondatabase/auth/next/server");
  cached = createNeonAuth({
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
  return cached;
}
