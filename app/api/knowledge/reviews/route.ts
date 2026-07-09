import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listPendingReviews } from "@/lib/datamodo/reviews";

// The user's pending knowledge reviews (merges + conflicts), most impactful first.
export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ reviews: [] });
  const reviews = await listPendingReviews(org.id);
  return NextResponse.json({ reviews });
}
