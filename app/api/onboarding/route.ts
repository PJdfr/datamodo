import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { saveOnboarding } from "@/lib/datamodo/settings";
import { getSessionUser } from "@/lib/auth/session";

// Save onboarding context (the "describe your business" + QCM answers) captured
// at signup, used to steer extraction.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    businessContext?: string;
    answers?: Record<string, unknown>;
  };
  const admin = createAdminClient();
  await saveOnboarding(user.id, { businessContext: body.businessContext, answers: body.answers });
  return NextResponse.json({ ok: true });
}
