import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { saveOnboarding } from "@/lib/datamodo/settings";

// Save onboarding context (the "describe your business" + QCM answers) captured
// at signup, used to steer extraction.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    businessContext?: string;
    answers?: Record<string, unknown>;
  };
  const admin = createAdminClient();
  await saveOnboarding(admin, user.id, { businessContext: body.businessContext, answers: body.answers });
  return NextResponse.json({ ok: true });
}
