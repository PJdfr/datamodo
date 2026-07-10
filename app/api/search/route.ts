import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { searchDatasets, searchKnowledge } from "@/lib/datamodo/search";
import { listKnowledge } from "@/lib/datamodo/knowledge";
import { answerQuestion } from "@/lib/datamodo/answer";

// Keyword search over the caller's own tables AND knowledge layer (entities +
// facts). Runs on the user's RLS client, so results are always scoped to them.
// With ?answer=1 an LLM composes a plain-language answer grounded in (and
// citing) those same results — best-effort: it can only ever ADD to the
// response, never drop results.
export const runtime = "nodejs";
// Keyword search is fast; the grounded answer adds one LLM call.
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const wantAnswer = url.searchParams.get("answer") === "1";
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!q) return NextResponse.json({ query: "", terms: [], total: 0, hits: [], entities: [], answer: null });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ query: q, terms: [], total: 0, hits: [], entities: [], answer: null });

  // Table rows + knowledge in parallel; knowledge is best-effort (may be behind
  // on migrations) so a failure there never drops the table results.
  const [result, kviews] = await Promise.all([
    searchDatasets(org.id, q),
    listKnowledge(org.id).catch(() => []),
  ]);
  const entities = searchKnowledge(kviews, result.terms);
  const answer = wantAnswer ? await answerQuestion(user.id, q, result.hits, entities) : null;
  return NextResponse.json({ ...result, entities, answer });
}
