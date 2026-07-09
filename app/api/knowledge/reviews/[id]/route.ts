import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { acceptReview, rejectReview } from "@/lib/datamodo/reviews";

// Accept or reject a knowledge review. Authorize with the user session; perform
// the privileged mutation (merge entities / revert a fact) with the admin client
// scoped to the user's verified org.
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "accept") await acceptReview(org.id, id);
  else if (action === "reject") await rejectReview(org.id, id);
  else return NextResponse.json({ error: "action must be accept|reject" }, { status: 400 });

  return NextResponse.json({ ok: true });
}
