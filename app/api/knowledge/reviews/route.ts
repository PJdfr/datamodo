import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listPendingReviews } from "@/lib/datamodo/reviews";

// The user's pending knowledge reviews (merges + conflicts), most impactful first.
export const runtime = "nodejs";

export async function GET() {
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ reviews: [] });
  const reviews = await listPendingReviews(org.id);
  return NextResponse.json({ reviews });
}
