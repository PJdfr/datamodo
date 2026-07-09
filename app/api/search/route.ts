import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { searchDatasets, searchKnowledge } from "@/lib/datamodo/search";
import { listKnowledge } from "@/lib/datamodo/knowledge";

// Keyword search over the caller's own tables AND knowledge layer (entities +
// facts). Runs on the user's RLS client, so results are always scoped to them.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!q) return NextResponse.json({ query: "", terms: [], total: 0, hits: [], entities: [] });
  const org = await getActiveOrg(db, user.id);
  if (!org) return NextResponse.json({ query: q, terms: [], total: 0, hits: [], entities: [] });

  // Table rows + knowledge in parallel; knowledge is best-effort (may be behind
  // on migrations) so a failure there never drops the table results.
  const [result, kviews] = await Promise.all([
    searchDatasets(db, org.id, q),
    listKnowledge(db, org.id).catch(() => []),
  ]);
  const entities = searchKnowledge(kviews, result.terms);
  return NextResponse.json({ ...result, entities });
}
