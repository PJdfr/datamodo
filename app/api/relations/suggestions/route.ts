import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { getRelationSuggestions } from "@/lib/datamodo/relations";

// Suggested table→table links the user hasn't drawn yet (shared column values).
// Read-only, on the user's RLS client, so it only ever sees their own tables.
export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ suggestions: [] });
  const suggestions = await getRelationSuggestions(org.id);
  return NextResponse.json({ suggestions });
}
