import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { usageSummary } from "@/lib/datamodo/usage";
import { PRICE_DATE } from "@/lib/datamodo/llm-cost";

// The caller's BYOK provider spend over a window (default 30 days) — what
// their OWN Anthropic/OpenAI/OpenRouter key cost while datamodo used it. Org-
// scoped; empty (not an error) when the ledger has nothing yet.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ summary: null });
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const summary = await usageSummary(org.id, { days });
  return NextResponse.json({ summary, priceDate: PRICE_DATE });
}
