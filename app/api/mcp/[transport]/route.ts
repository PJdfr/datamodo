import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { verifyMcpToken, mcpTokenSecret } from "@/lib/datamodo/mcp-token";
import { parseExtraction } from "@/lib/datamodo/mcp-extraction";
import { listKnowledge } from "@/lib/datamodo/knowledge";
import { searchKnowledge, tokenize } from "@/lib/datamodo/search";
import { linkQueryEntities, expandFromSeeds } from "@/lib/datamodo/graphrag";

// THE MCP SERVER (phase 1) — datamodo on a Claude SUBSCRIPTION, no API key
// (ROADMAP "MCP server / connectors"). The architecture already splits
// extraction (an LLM's job) from ingestion (deterministic: canonicalization,
// resolution, dedup, supersession, reviews) — these tools invert who runs the
// model: the CLIENT (Claude on the user's sub) extracts, `submit_extraction`
// feeds the SAME server pipeline every channel uses. Reads give the model the
// context to extract well (the registry, resolution candidates, the graph).
//
// Auth (phase 1): per-user bearer tokens, HMAC-derived (mcp-token.ts) — no
// schema change, stateless; the Settings modal hands the user their token.
// OAuth (claude.ai connectors' dynamic registration) is phase 2, as is the
// pull-model `process_inbox`. Transport: streamable HTTP only (stateless —
// SSE would need Redis).
export const runtime = "nodejs";
export const maxDuration = 60;

interface Caller {
  userId: string;
  orgId: string;
}

/** Resolve the tool caller from the verified token's AuthInfo. */
async function caller(extra: { authInfo?: AuthInfo }): Promise<Caller> {
  const userId = (extra.authInfo?.extra as { userId?: string } | undefined)?.userId;
  if (!userId) throw new Error("unauthorized");
  const org = await getActiveOrg(userId);
  if (!org) throw new Error("no workspace for this account yet — sign in to the app once first");
  return { userId, orgId: org.id };
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 1));

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_kinds",
      "The user's category registry: every kind of thing their vault tracks, with its field template and relations. Read this before extracting — reuse these kinds and field keys wherever they fit.",
      {},
      async (_args, extra) => {
        const { userId, orgId } = await caller(extra);
        const { listKinds } = await import("@/lib/datamodo/kinds");
        const kinds = await listKinds(orgId, userId);
        return json(kinds.map((k) => ({
          kind: k.kind,
          label: k.label,
          fields: k.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required ?? false })),
          relations: (k.relations ?? []).map((r) => ({ predicate: r.predicate, targetKind: r.targetKind ?? null })),
        })));
      },
    );

    server.tool(
      "search_entities",
      "Find existing entities by name/keys/facts — the resolution candidates. Before inventing an entity in an extraction, search for it here and reuse the EXACT label of a match so the server resolves instead of duplicating.",
      { query: z.string().min(1).max(300) },
      async ({ query }, extra) => {
        const { orgId } = await caller(extra);
        const kviews = await listKnowledge(orgId);
        const terms = tokenize(query);
        const byId = new Map(kviews.map((e) => [e.id, e]));
        const seedIds = new Set(linkQueryEntities(kviews, terms, { limit: 5 }));
        const hits = searchKnowledge(kviews, terms, { limit: 12 });
        const rows = [
          ...[...seedIds].map((id) => byId.get(id)!).filter(Boolean),
          ...hits.filter((h) => !seedIds.has(h.id)).map((h) => byId.get(h.id)!).filter(Boolean),
        ].slice(0, 12);
        return json(rows.map((e) => ({ id: e.id, kind: e.kind, label: e.label, naturalKeys: e.naturalKeys, connections: e.edges })));
      },
    );

    server.tool(
      "get_context",
      "What the vault already knows around a topic: the graph-first evidence (seed entities + their facts + their neighbors' facts, current claims only). Use it to answer questions from the user's own data, or to ground an extraction.",
      { query: z.string().min(1).max(500) },
      async ({ query }, extra) => {
        const { orgId } = await caller(extra);
        const kviews = await listKnowledge(orgId);
        const seeds = linkQueryEntities(kviews, tokenize(query));
        const evidence = seeds.length ? expandFromSeeds(kviews, seeds) : { hits: searchKnowledge(kviews, tokenize(query), { limit: 6 }), scopeIds: [] };
        if (evidence.hits.length === 0) return text("Nothing in the vault matches that yet.");
        const lines = evidence.hits.map((h) => {
          const facts = h.facts.slice(0, 12).map((f) => `  - ${f.predicate.replace(/_/g, " ")}: ${f.ref ? "→ " : ""}${f.value}`).join("\n");
          return `◆ ${h.label} (${h.kind})${facts ? `\n${facts}` : ""}`;
        });
        return text(`Current claims from the user's vault:\n\n${lines.join("\n\n")}`);
      },
    );

    server.tool(
      "pending_reviews",
      "Decisions waiting on the user (merges, conflicts, proposals), newest first. Surface them when relevant; resolve one ONLY when the user explicitly decides.",
      {},
      async (_args, extra) => {
        const { orgId } = await caller(extra);
        const { pendingQuestions } = await import("@/lib/datamodo/review-inbox");
        return json(await pendingQuestions(orgId));
      },
    );

    server.tool(
      "resolve_review",
      "Apply the user's decision on a pending review — the same real side-effects as the app's Review tab. Requires the user's explicit yes/no; never decide for them.",
      { reviewId: z.string().min(1), accept: z.boolean() },
      async ({ reviewId, accept }, extra) => {
        const { orgId } = await caller(extra);
        const { acceptReview, rejectReview } = await import("@/lib/datamodo/reviews");
        try {
          if (accept) await acceptReview(orgId, reviewId);
          else await rejectReview(orgId, reviewId);
          return text(`${accept ? "✓ approved" : "✗ declined"} — applied for real.`);
        } catch {
          return text("Could not apply — the review may already be resolved. Check the app's Review tab.");
        }
      },
    );

    server.tool(
      "submit_extraction",
      "File what YOU extracted from a message/document into the vault. You are the extractor; the server stays deterministic (canonicalization, entity resolution, dedup, supersession, review routing). Reuse kinds from list_kinds and labels from search_entities. Include sourceText so provenance and the commit log work.",
      {
        sourceText: z.string().max(20000).optional().describe("The raw message/document text this was extracted from"),
        subject: z.string().max(300).optional().describe("A short title for the source (email subject etc.)"),
        extraction: z
          .object({
            entities: z.array(z.object({
              localId: z.string(),
              kind: z.string(),
              label: z.string(),
              naturalKeys: z.record(z.string(), z.string()).optional(),
            })),
            facts: z.array(z.object({
              subjectLocalId: z.string(),
              predicate: z.string().describe("snake_case verb/attribute"),
              cardinality: z.enum(["one", "many"]).optional(),
              value: z.union([
                z.object({ kind: z.literal("text"), text: z.string() }),
                z.object({ kind: z.literal("number"), num: z.number(), unit: z.string().optional() }),
                z.object({ kind: z.literal("date"), date: z.string().describe("YYYY-MM-DD") }),
                z.object({ kind: z.literal("entity"), entityLocalId: z.string() }),
              ]),
              confidence: z.number().min(0).max(1).optional(),
              snippet: z.string().optional().describe("Short quote from the source backing this fact"),
            })),
          })
          .describe("Entities + facts in the server's Extraction contract"),
      },
      async ({ sourceText, subject, extraction }, extra) => {
        const { userId, orgId } = await caller(extra);
        // Strict validation beyond the transport schema (dangling localIds,
        // caps, date format) — bounce fixable errors back to the model.
        const parsed = parseExtraction(extraction);
        if (!parsed.ok) return text(parsed.error);

        // Capture the source as an item (provenance, the commit log, files) —
        // best-effort: a blob-storage hiccup must not drop the extraction.
        let itemId: string | null = null;
        if (sourceText?.trim()) {
          try {
            const { ingest } = await import("@/lib/ingest/store");
            const r = await ingest({
              channel: "upload",
              captureMode: "active",
              orgId,
              ownerUserId: userId,
              sender: "claude (mcp)",
              subject: subject?.trim() || undefined,
              bodyText: sourceText,
              meta: { via: "mcp" },
            });
            itemId = r.itemId;
            // The CLIENT already extracted — mark the item done so the cron
            // tick never runs the server-side extractor over it again.
            const { EXTRACTION_VERSION } = await import("@/lib/datamodo/extract");
            await prisma.items.update({
              where: { id: itemId },
              data: { status: "analyzed", extraction_version: EXTRACTION_VERSION },
            });
          } catch (e) {
            console.error("[mcp] source capture failed (extraction continues)", e);
          }
        }

        // The SAME deterministic pipeline every channel feeds. Adjudication
        // is fail-soft without a server LLM key — ambiguous matches become
        // review proposals instead of auto-merges.
        const { ingestExtraction } = await import("@/lib/datamodo/knowledge");
        const { llmForUser } = await import("@/lib/datamodo/llm-for-user");
        const llm = await llmForUser(userId);
        const result = await ingestExtraction(orgId, userId, itemId, parsed.extraction, llm);
        return json({ filed: true, sourceItemId: itemId, ...result });
      },
    );
  },
  { serverInfo: { name: "datamodo", version: "1.0.0" } },
  { basePath: "/api/mcp", maxDuration: 60, verboseLogs: false },
);

const verifyToken = async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
  const secret = mcpTokenSecret();
  if (!bearer || !secret) return undefined;
  const userId = verifyMcpToken(bearer, secret);
  if (!userId) return undefined;
  return { token: bearer, scopes: ["vault"], clientId: userId, extra: { userId } };
};

const authed = withMcpAuth(handler, verifyToken, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
