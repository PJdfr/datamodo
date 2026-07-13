import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

// Next.js 16 renamed the `middleware` file convention to `proxy`. Neon Auth's
// middleware keeps the session fresh and redirects unauthenticated users away
// from protected routes.
const neonAuthMiddleware = auth.middleware({
  loginUrl: "/login",
});

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
export default function proxy(request: NextRequest) {
  if (request.method !== "GET" || request.headers.has("next-action")) {
    return NextResponse.next();
  }
  return neonAuthMiddleware(request);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
