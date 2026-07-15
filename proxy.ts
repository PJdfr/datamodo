import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

// Next.js 16 renamed the `middleware` file convention to `proxy`. Neon Auth's
// middleware keeps the session fresh and redirects unauthenticated users away
// from protected routes. Built lazily (see lib/auth/server) so importing this
// module never constructs better-auth — the local edition returns before it.

// Bug in @neondatabase/auth@0.4.2-beta: its middleware proxies the INCOMING
// request's method to the upstream (GET-only) `/get-session` endpoint. A
// Server Action is a POST to the current /dashboard route, so session
// verification fails, `session` comes back null, and the action POST is
// redirected to /login — which the action client can't parse ("Something went
// wrong — reload the page…"). Every dashboard mutation hits this.
//
// Server Actions carry a `next-action` header and already run through the
// auth-guarded dashboard layout AND re-check the session inside each action, so
// the middleware's redirect is redundant for them. Skip it for those requests
// (and any non-GET) and let them reach the already-protected action.
export default async function proxy(request: NextRequest) {
  // Local edition: there is no login — one user, on their own machine — so the
  // auth middleware (which would redirect to /login) is skipped entirely.
  if (process.env.DATAMODO_LOCAL === "1") return NextResponse.next();
  if (request.method !== "GET" || request.headers.has("next-action")) {
    return NextResponse.next();
  }
  const neonAuthMiddleware = (await getAuth()).middleware({ loginUrl: "/login" });
  return neonAuthMiddleware(request);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
