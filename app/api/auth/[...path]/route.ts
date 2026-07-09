import { auth } from "@/lib/auth/server";

// Proxies all Neon Auth (Better Auth) API requests — sign-in/up/out, OAuth
// callbacks, session — through the SDK handler.
export const { GET, POST } = auth.handler();
