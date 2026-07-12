import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { acceptReview, rejectReview } from "@/lib/datamodo/reviews";

// The chat's side of the PULL REQUEST loop: datamodo's bubble lists pending
// decisions; tapping ✓/✗ posts here and applies the review with its real
// side-effects (merge executed, category created, extraction retracted…).
// Same accept/reject core the Review Studio and the WhatsApp reply use.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { id?: string; accept?: boolean } | null;
  if (!body || typeof body.id !== "string" || typeof body.accept !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    if (body.accept) await acceptReview(org.id, body.id);
    else await rejectReview(org.id, body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[chat] review decision failed", e);
    return NextResponse.json({ error: "could not apply — it may already be resolved" }, { status: 409 });
  }
}
