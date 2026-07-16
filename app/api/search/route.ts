import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { searchDatasets, searchKnowledge } from "@/lib/datamodo/search";
import { searchChunks } from "@/lib/datamodo/chunks";
import { annLinkEntities, listKnowledge, touchEntities } from "@/lib/datamodo/knowledge";
import { linkQueryEntities, expandFromSeeds, mergeKnowledgeHits } from "@/lib/datamodo/graphrag";
import { embedTexts } from "@/lib/llm/embeddings";
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
  if (!q) return NextResponse.json({ query: "", terms: [], total: 0, hits: [], entities: [], passages: [], answer: null });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ query: q, terms: [], total: 0, hits: [], entities: [], passages: [], answer: null });

  // AGENT LENS (P5): ?agent=<id> scopes the KNOWLEDGE evidence (facts that
  // agent wrote — entities, traversal, grounded answers) to that agent's
  // view. Table-row keyword hits stay global: rows are their own surface.
  const agentId = url.searchParams.get("agent");

  // Table rows + knowledge in parallel; knowledge + passages are best-effort
  // so a failure there never drops the table results.
  const [result, kviews] = await Promise.all([
    searchDatasets(org.id, q),
    listKnowledge(org.id, { agentId }).catch(() => []),
  ]);
  const entities = searchKnowledge(kviews, result.terms);

  if (!wantAnswer) {
    // Plain search: passages recall two ways — exact terms + semantic ANN
    // over the raw query (fail-soft: keyword-only without an embeddings key).
    const passages = await searchChunks(org.id, result.terms, { query: q }).catch(() => []);
    return NextResponse.json({ ...result, entities, passages, answer: null });
  }

  // Answer mode is GRAPH-FIRST (GraphRAG): link the query to entities (text
  // coverage + one query embedding shared with the chunk leg), traverse the
  // fact graph around those seeds, and SCOPE chunk retrieval to that
  // neighborhood. Every step fails soft back to the plain keyword evidence.
  const vector = (await embedTexts([q]).catch(() => null))?.[0] ?? null;
  const textSeeds = linkQueryEntities(kviews, result.terms);
  const annSeeds = vector ? await annLinkEntities(org.id, vector) : [];
  const graph = expandFromSeeds(kviews, [...new Set([...textSeeds, ...annSeeds])]);
  const evidence = mergeKnowledgeHits(entities, graph.hits);
  const passages = await searchChunks(org.id, result.terms, {
    query: q,
    vector,
    entityIds: graph.scopeIds.length ? graph.scopeIds : undefined,
  }).catch(() => []);
  const answer = await answerQuestion(user.id, q, result.hits, evidence, passages);
  // Usage-weighted retention: the entities this retrieval actually SURFACED
  // (graph seeds + whatever the answer cited) count as "read" — consolidation
  // then never prunes them. Fail-soft, never blocks the response.
  await touchEntities(org.id, [
    ...textSeeds,
    ...annSeeds,
    ...(answer?.sources.map((s) => s.entityId).filter(Boolean) as string[] ?? []),
  ]);
  // The UI's result lists keep the plain keyword hits; only the grounded
  // answer runs on the graph evidence.
  return NextResponse.json({ ...result, entities, passages, answer });
}
