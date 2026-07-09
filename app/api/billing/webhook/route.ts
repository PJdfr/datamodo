import Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { setPlanFromStripe } from "@/lib/datamodo/settings";
import type { Plan } from "@/lib/datamodo/plans";

// Stripe webhook → keeps user_settings.plan in sync with the subscription.
// Uses the service-role client (no user session on a webhook). Inert until the
// Stripe env vars are set.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) return new Response("Billing not configured", { status: 503 });

  const stripe = new Stripe(secret);
  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, whSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.client_reference_id ?? s.metadata?.user_id;
      const plan = (s.metadata?.plan as Plan) ?? "pro";
      if (userId) {
        await setPlanFromStripe(userId, {
          plan,
          status: "active",
          customerId: (s.customer as string) ?? undefined,
          subscriptionId: (s.subscription as string) ?? undefined,
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await admin
        .from("user_settings")
        .update({ plan: "free", plan_status: "canceled" })
        .eq("stripe_customer_id", sub.customer as string);
    }
  } catch (e) {
    console.error("[billing/webhook] handler failed", e);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok");
}
