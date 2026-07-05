import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Routes that require an authenticated user.
const PROTECTED_PREFIXES = ["/dashboard"];
// Auth routes an already-authenticated user should be bounced away from.
const AUTH_ROUTES = ["/login", "/register"];

/**
 * Refreshes the Supabase auth session on every request and enforces route
 * access. Invoked from the root `proxy.ts` (Next.js 16 renamed `middleware`
 * to `proxy`).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: Do not run code between createServerClient and getClaims().
  // getClaims() verifies and, if needed, refreshes the session — which sets
  // fresh cookies on `supabaseResponse`.
  const { data } = await supabase.auth.getClaims();
  const isAuthed = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!isAuthed && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthed && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
