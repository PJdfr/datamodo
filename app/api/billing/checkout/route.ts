import Stripe from "stripe";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/local/config";

// Starts a Stripe Checkout for a plan upgrade. Inert (503) until the Stripe
// env vars are set, so the app builds and runs without billing configured.
export const runtime = "nodejs";

const PRICE_ENV: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  max: process.env.STRIPE_PRICE_MAX,
};

export async function POST(req: Request) {
  // Cloud-only: the local edition is single-user and unbilled.
  if (isLocalMode()) return new Response("Not found", { status: 404 });
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return Response.json({ error: "Billing isn’t configured yet." }, { status: 503 });
  }

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
  const price = plan ? PRICE_ENV[plan] : undefined;
  if (!price) {
    return Response.json({ error: "That plan isn’t available for checkout." }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to upgrade." }, { status: 401 });

  const stripe = new Stripe(secret);
  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata: { user_id: user.id, plan: plan! },
    success_url: `${origin}/dashboard?upgraded=1`,
    cancel_url: `${origin}/#pricing`,
  });

  return Response.json({ url: session.url });
}
