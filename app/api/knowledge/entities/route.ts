import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKnowledge } from "@/lib/datamodo/knowledge";

// The user's knowledge layer (entities + facts). Read-only, RLS-scoped.
export const runtime = "nodejs";

export async function GET() {
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ entities: [] });
  const entities = await listKnowledge(org.id);
  return NextResponse.json({ entities });
}
