import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { suggestKindTemplate } from "@/lib/datamodo/kinds";

// Draft a category template with the LLM: the user types a name (+ optional
// sentence), the agent proposes fields/relations/aliases/icon. One LLM call.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });
  const { name, hint } = (await req.json().catch(() => ({}))) as { name?: string; hint?: string };
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    const template = await suggestKindTemplate(user.id, name.trim(), hint?.trim() || null);
    return NextResponse.json({ template });
  } catch {
    return NextResponse.json({ error: "could not draft a template — add fields manually" }, { status: 502 });
  }
}
