import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/channels/inbound";
import { parseActivity, reply, verifyRequest } from "@/lib/channels/teams";

// Microsoft Teams / Bot Framework messaging endpoint. Authenticated by a Bearer
// JWT the Bot Framework token service signs; we verify it against the channel
// JWKS before touching the Activity.
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await verifyRequest(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const messages = parseActivity(body);
    await handleInbound("teams", messages, reply);
  } catch (e) {
    console.error("[webhooks/teams] failed", e);
  }
  return NextResponse.json({ ok: true });
}
