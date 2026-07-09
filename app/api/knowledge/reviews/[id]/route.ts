import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { acceptReview, rejectReview } from "@/lib/datamodo/reviews";

// Accept or reject a knowledge review. Authorize with the user session; perform
// the privileged mutation (merge entities / revert a fact) with the admin client
// scoped to the user's verified org.
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(db, user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const admin = createAdminClient();
  if (action === "accept") await acceptReview(admin, org.id, id);
  else if (action === "reject") await rejectReview(admin, org.id, id);
  else return NextResponse.json({ error: "action must be accept|reject" }, { status: 400 });

  return NextResponse.json({ ok: true });
}
