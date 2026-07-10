import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKinds, createKind, type KindInput } from "@/lib/datamodo/kinds";

// The user's category registry (ontology layer). GET seeds the builtins on
// first read; POST creates a user-defined category.
export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });
  const kinds = await listKinds(org.id, user.id);
  return NextResponse.json({ kinds });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });
  const input = (await req.json().catch(() => null)) as KindInput | null;
  if (!input?.label?.trim()) return NextResponse.json({ error: "label required" }, { status: 400 });
  try {
    const kind = await createKind(org.id, user.id, input);
    return NextResponse.json({ kind }, { status: 201 });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const status = msg.includes("Unique constraint") ? 409 : 400;
    return NextResponse.json({ error: status === 409 ? "a category with this name already exists" : msg }, { status });
  }
}
