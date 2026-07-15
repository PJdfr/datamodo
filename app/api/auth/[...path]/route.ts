import { getAuth } from "@/lib/auth/server";
import { isLocalMode } from "@/lib/local/config";

// Proxies all Neon Auth (Better Auth) API requests — sign-in/up/out, OAuth
// callbacks, session — through the SDK handler. The handler is built lazily,
// per request, so this module never constructs better-auth at import (page-data
// collection during `next build`) — that's what made the build need cloud auth
// secrets. The local edition has no cloud auth, so it 404s here.
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: RouteContext, method: "GET" | "POST"): Promise<Response> {
  if (isLocalMode()) return new Response("Not found", { status: 404 });
  const { handler } = await getAuth();
  return handler()[method](req, ctx);
}

export function GET(req: Request, ctx: RouteContext) {
  return handle(req, ctx, "GET");
}

export function POST(req: Request, ctx: RouteContext) {
  return handle(req, ctx, "POST");
}
