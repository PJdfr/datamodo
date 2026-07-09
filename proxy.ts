import { auth } from "@/lib/auth/server";

// Next.js 16 renamed the `middleware` file convention to `proxy`. Neon Auth's
// middleware keeps the session fresh and redirects unauthenticated users away
// from protected routes.
export default auth.middleware({
  loginUrl: "/login",
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
