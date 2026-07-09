import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { getRelationSuggestions } from "@/lib/datamodo/relations";

// Suggested table→table links the user hasn't drawn yet (shared column values).
// Read-only, on the user's RLS client, so it only ever sees their own tables.
export const runtime = "nodejs";

export async function GET() {
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(db, user.id);
  if (!org) return NextResponse.json({ suggestions: [] });
  const suggestions = await getRelationSuggestions(db, org.id);
  return NextResponse.json({ suggestions });
}
