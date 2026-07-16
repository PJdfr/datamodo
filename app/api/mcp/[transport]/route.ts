import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { isLocalMode } from "@/lib/local/config";
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
      "get_entity",
      "One entity in full: every current fact (with confidence and source counts) plus its markdown body when it has one (documents, notes, syntheses). Use after search_entities when you need the whole record.",
      { entityId: z.string().min(1) },
      async ({ entityId }, extra) => {
        const { orgId } = await caller(extra);
        const kviews = await listKnowledge(orgId);
        const e = kviews.find((x) => x.id === entityId);
        if (!e) return text("No entity with that id.");
        const facts = e.facts.map((f) => `- ${f.predicate.replace(/_/g, " ")}: ${f.ref ? "→ " : ""}${f.value} (${Math.round(f.confidence * 100)}%, ${f.sources} source${f.sources === 1 ? "" : "s"})`).join("\n");
        const keys = Object.entries(e.naturalKeys ?? {}).map(([k, v]) => `${k}=${v}`).join(", ");
        return text(
          `${e.label} (${e.kind})${keys ? ` [${keys}]` : ""}\n${facts || "(no facts yet)"}` +
          (e.bodyMd ? `\n\n--- body ---\n${e.bodyMd.slice(0, 8000)}` : ""),
        );
      },
    );

    server.tool(
      "process_inbox",
      "The pull model: raw captured items still waiting for extraction (a keyless deployment queues everything here). YOU are the extractor — read each item's text, extract entities+facts, and file them with submit_extraction using the item's id so provenance attaches. Consult list_kinds and search_entities first.",
      { limit: z.number().int().min(1).max(10).optional() },
      async ({ limit }, extra) => {
        const { orgId } = await caller(extra);
        // stored = never extracted; failed = the server-side extractor gave
        // up (e.g. no key) — both are exactly what the sub-powered client is
        // for. Read-only: nothing is claimed until submit_extraction lands.
        const items = await prisma.items.findMany({
          where: { org_id: orgId, status: { in: ["stored", "failed"] } },
          orderBy: { received_at: "asc" },
          take: limit ?? 5,
          select: { id: true, org_id: true, channel: true, sender: true, subject: true, body_hash: true, body_preview: true, received_at: true },
        });
        if (items.length === 0) return text("Inbox is clear — nothing waiting for extraction.");
        const { loadItemText } = await import("@/lib/datamodo/extract");
        const out = await Promise.all(items.map(async (it) => ({
          itemId: it.id,
          channel: String(it.channel),
          sender: it.sender,
          subject: it.subject,
          receivedAt: it.received_at.toISOString(),
          text: (await loadItemText(it).catch(() => it.body_preview ?? "")).slice(0, 12000),
        })));
        return json(out);
      },
    );

    server.tool(
      "capture_message",
      "Forward raw content INTO the vault — the 'send it to datamodo' gesture from a conversation. The server pipeline stores the original and extracts from it (you don't have to). Use submit_extraction instead when YOU already extracted the entities+facts.",
      {
        text: z.string().min(1).max(50_000).describe("The raw message/document text to capture"),
        subject: z.string().max(300).optional().describe("A short title (email-subject style)"),
      },
      async ({ text: bodyText, subject }, extra) => {
        const { userId, orgId } = await caller(extra);
        const { ingest, IngestError } = await import("@/lib/ingest/store");
        try {
          const r = await ingest({
            channel: "upload",
            captureMode: "active",
            orgId,
            ownerUserId: userId,
            sender: "claude (mcp)",
            subject: subject?.trim() || undefined,
            bodyText,
            meta: { via: "mcp" },
          });
          if (!r.deduped) {
            const { kickExtraction } = await import("@/lib/ingest/kick");
            kickExtraction();
          }
          return json({ captured: true, itemId: r.itemId, deduped: r.deduped ?? false });
        } catch (e) {
          if (e instanceof IngestError) return text(`Could not capture: ${e.message}`);
          throw e;
        }
      },
    );

    server.tool(
      "walk_graph",
      "The Explorer as a tool: the neighborhood around one entity — hop-1 and hop-2 neighbors with the predicates connecting them. Use it to wander the vault edge-to-edge (get the id from search_entities; walk again from any neighbor).",
      {
        entityId: z.string().min(1),
        maxNeighbors: z.number().int().min(1).max(30).optional().describe("Ring cap per hop (default 14)"),
      },
      async ({ entityId, maxNeighbors }, extra) => {
        const { orgId } = await caller(extra);
        const kviews = await listKnowledge(orgId);
        const { buildEgoGraph } = await import("@/lib/datamodo/explorer");
        const g = buildEgoGraph(kviews, entityId, { maxHop1: maxNeighbors ?? 14, maxHop2: maxNeighbors ?? 14 });
        if (!g) return text("No entity with that id — find one with search_entities first.");
        return json({
          center: { id: g.center.entity.id, kind: g.center.entity.kind, label: g.center.entity.label },
          nodes: g.nodes
            .filter((n) => n.entity.id !== g.center.entity.id)
            .map((n) => ({ id: n.entity.id, kind: n.entity.kind, label: n.entity.label, hop: n.hop })),
          edges: g.edges.map((e) => ({ from: e.fromLabel, predicate: e.fact.predicate, to: e.toLabel, confidence: e.fact.confidence })),
          truncated: g.truncated,
        });
      },
    );

    server.tool(
      "list_facts",
      "Structured fact queries over the bitemporal vault: filter by subject entity, predicate, and/or kind — optionally AS OF a past date (what was believed true then). Every fact carries confidence and validity window. Prefer get_context for open questions; use this for precise 'what is/was X's Y' lookups.",
      {
        subjectEntityId: z.string().optional().describe("Only facts about this entity (from search_entities)"),
        predicate: z.string().optional().describe("snake_case predicate, e.g. amount, due_date, works_at"),
        kind: z.string().optional().describe("Only facts whose subject is this kind, e.g. invoice"),
        asOf: z.string().optional().describe("YYYY-MM-DD — the vault as believed on that date (default: now)"),
        limit: z.number().int().min(1).max(100).optional(),
      },
      async ({ subjectEntityId, predicate, kind, asOf, limit }, extra) => {
        const { orgId } = await caller(extra);
        if (!subjectEntityId && !predicate && !kind) return text("Give at least one filter (subjectEntityId, predicate, or kind).");
        const at = asOf ? new Date(`${asOf}T23:59:59Z`) : new Date();
        if (Number.isNaN(at.getTime())) return text("asOf must be YYYY-MM-DD.");
        const rows = await prisma.facts.findMany({
          where: {
            org_id: orgId,
            ...(subjectEntityId ? { subject_entity_id: subjectEntityId } : {}),
            ...(predicate ? { predicate } : {}),
            ...(kind ? { entities_facts_subject_entity_idToentities: { kind } } : {}),
            valid_from: { lte: at },
            OR: [{ valid_to: null }, { valid_to: { gt: at } }],
          },
          orderBy: [{ valid_from: "desc" }],
          take: limit ?? 40,
          select: {
            predicate: true, value_text: true, value_num: true, value_date: true, unit: true,
            confidence: true, valid_from: true, valid_to: true,
            entities_facts_subject_entity_idToentities: { select: { id: true, kind: true, canonical_label: true } },
            entities_facts_object_entity_idToentities: { select: { id: true, canonical_label: true } },
          },
        });
        if (rows.length === 0) return text(`No facts match${asOf ? ` as of ${asOf}` : ""}.`);
        return json(rows.map((f) => ({
          subject: { id: f.entities_facts_subject_entity_idToentities.id, kind: f.entities_facts_subject_entity_idToentities.kind, label: f.entities_facts_subject_entity_idToentities.canonical_label },
          predicate: f.predicate,
          value: f.entities_facts_object_entity_idToentities
            ? { entity: f.entities_facts_object_entity_idToentities.canonical_label, entityId: f.entities_facts_object_entity_idToentities.id }
            : f.value_date ? f.value_date.toISOString().slice(0, 10)
            : f.value_num !== null ? `${f.value_num}${f.unit ? ` ${f.unit}` : ""}`
            : f.value_text,
          confidence: f.confidence,
          validFrom: f.valid_from.toISOString(),
          validTo: f.valid_to?.toISOString() ?? null,
        })));
      },
    );

    server.tool(
      "search_documents",
      "Passage search over the user's captured documents (keyword + semantic when embeddings are configured). Returns the exact passages with their source document — quote them when answering from documents.",
      { query: z.string().min(1).max(300), limit: z.number().int().min(1).max(12).optional() },
      async ({ query, limit }, extra) => {
        const { orgId } = await caller(extra);
        const { searchChunks } = await import("@/lib/datamodo/chunks");
        const hits = await searchChunks(orgId, tokenize(query), { query, limit: limit ?? 6 });
        if (hits.length === 0) return text("No document passages match.");
        return json(hits.map((h) => ({ document: h.docLabel, entityId: h.entityId, page: h.page, passage: h.text.slice(0, 1500) })));
      },
    );

    server.tool(
      "list_tables",
      "The user's tables (datasets): columns, row counts, and which agent fills each. Tables are PROJECTIONS of the vault — rows materialize from facts; there is no direct row-write tool (file data via submit_extraction or capture_message instead).",
      {},
      async (_args, extra) => {
        const { orgId } = await caller(extra);
        const { listDatasets } = await import("@/lib/datamodo/datasets");
        const ds = await listDatasets(orgId);
        if (ds.length === 0) return text("No tables yet.");
        return json(ds.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description ?? null,
          columns: (d.columns ?? []).map((c) => ({ key: c.key, label: c.label, type: c.type })),
          rowCount: d.rowCount,
          agent: d.agentName,
          pendingProposals: d.proposals.length,
        })));
      },
    );

    server.tool(
      "get_table_rows",
      "Read one table's live rows, paged. Get the table id from list_tables.",
      {
        tableId: z.string().min(1),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
      async ({ tableId, limit, offset }, extra) => {
        const { orgId } = await caller(extra);
        // Org scoping: the table must belong to the caller's workspace.
        const ds = await prisma.datasets.findFirst({ where: { id: tableId, org_id: orgId }, select: { id: true, name: true } });
        if (!ds) return text("No table with that id — call list_tables for current ids.");
        const { listDatasetRows } = await import("@/lib/datamodo/datasets");
        const { rows, total } = await listDatasetRows(ds.id, { limit: limit ?? 50, offset: offset ?? 0 });
        return json({ table: ds.name, total, offset: offset ?? 0, rows: rows.map((r) => r.data) });
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
        itemId: z.string().optional().describe("A queued item's id from process_inbox — attaches this extraction to it (provenance, commit log) and marks it processed"),
        sourceText: z.string().max(20000).optional().describe("The raw message/document text this was extracted from (ignored when itemId is given)"),
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
      async ({ itemId: givenItemId, sourceText, subject, extraction }, extra) => {
        const { userId, orgId } = await caller(extra);
        // Strict validation beyond the transport schema (dangling localIds,
        // caps, date format) — bounce fixable errors back to the model.
        const parsed = parseExtraction(extraction);
        if (!parsed.ok) return text(parsed.error);

        // Pull model: the extraction attaches to an EXISTING queued item
        // (process_inbox) — validated against the org, then marked processed.
        let itemId: string | null = null;
        if (givenItemId) {
          const item = await prisma.items.findFirst({ where: { id: givenItemId, org_id: orgId }, select: { id: true } });
          if (!item) return text(`No item "${givenItemId}" in this workspace — call process_inbox for current ids.`);
          itemId = item.id;
        }

        // Push model: capture the source as a new item (provenance, the
        // commit log, files) — best-effort: a blob-storage hiccup must not
        // drop the extraction.
        if (!itemId && sourceText?.trim()) {
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

        // The CLIENT extracted — mark the item done (either path) so the cron
        // tick never runs the server-side extractor over it again.
        if (itemId) {
          const { EXTRACTION_VERSION } = await import("@/lib/datamodo/extract");
          await prisma.items
            .update({ where: { id: itemId }, data: { status: "analyzed", error: null, extraction_version: EXTRACTION_VERSION } })
            .catch((e) => console.error("[mcp] item status update failed", e));
        }
        return json({ filed: true, sourceItemId: itemId, ...result });
      },
    );
  },
  { serverInfo: { name: "datamodo", version: "1.0.0" } },
  { basePath: "/api/mcp", maxDuration: 60, verboseLogs: false },
);

// Credentials accepted (all resolved in lib/datamodo/mcp-auth.ts): LOCAL mode
// is tokenless (127.0.0.1 is the boundary); dmk_ HMAC tokens serve Claude
// Code; dmo_ OAuth tokens serve claude.ai connectors (phase 3).
const verifyToken = async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
  const { resolveMcpBearer } = await import("@/lib/datamodo/mcp-auth");
  return resolveMcpBearer(bearer);
};

const authed = withMcpAuth(handler, verifyToken, { required: !isLocalMode() });

// RFC 9728: a 401 must point the client at the protected-resource metadata so
// OAuth-capable clients (claude.ai) can discover the authorization server.
const challenge = (h: typeof authed) => async (req: Request) => {
  const res = await h(req);
  if (res.status !== 401) return res;
  const headers = new Headers(res.headers);
  headers.set(
    "www-authenticate",
    `Bearer resource_metadata="${new URL(req.url).origin}/.well-known/oauth-protected-resource"`,
  );
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};
const routed = challenge(authed);

export { routed as GET, routed as POST, routed as DELETE };
