import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { searchDatasets } from "@/lib/datamodo/search";

// Keyword search over the caller's own tables. Runs on the user's RLS client,
// so results are always scoped to the signed-in user.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!q) return NextResponse.json({ query: "", terms: [], total: 0, hits: [] });
  const org = await getActiveOrg(db, user.id);
  if (!org) return NextResponse.json({ query: q, terms: [], total: 0, hits: [] });
  const result = await searchDatasets(db, org.id, q);
  return NextResponse.json(result);
}
