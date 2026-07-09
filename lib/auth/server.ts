import { createNeonAuth } from "@neondatabase/auth/next/server";

// Server-side Neon Auth (Better Auth) instance. Provides .handler() for the
// /api/auth route, .middleware() for route protection, and .getSession() +
// sign-in/up/out for server actions & server components. Replaces the Supabase
// SSR auth client.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
