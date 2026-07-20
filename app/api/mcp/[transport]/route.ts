import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { isLocalMode } from "@/lib/local/config";
import { parseExtraction, EXTRACTION_DOCTRINE, MCP_INSTRUCTIONS } from "@/lib/datamodo/mcp-extraction";
import type { KindField, KindRelation } from "@/lib/datamodo/ontology";
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

// A category's template = its fields + relations (the schema; also the table's
// columns). Shared by create_category / update_category. `key`/`predicate`
// slug-normalize server-side (kinds.ts sanitize), so a label alone is enough.
const fieldShape = z.object({
  label: z.string().min(1).max(80),
  key: z.string().max(60).optional().describe("snake_case; defaults from the label"),
  type: z.enum(["text", "number", "date", "entity"]).optional().describe("default text"),
  unit: z.string().max(20).optional().describe("for numbers, e.g. USD"),
  required: z.boolean().optional(),
  cardinality: z.enum(["one", "many"]).optional().describe("many = list-like (tags, emails)"),
});
const relationShape = z.object({
  predicate: z.string().min(1).max(80).describe("snake_case verb, e.g. works_for"),
  label: z.string().min(1).max(80),
  targetKind: z.string().max(60).optional().describe("the kind it points at, e.g. company"),
  cardinality: z.enum(["one", "many"]).optional(),
});
type FieldIn = z.infer<typeof fieldShape>;
type RelationIn = z.infer<typeof relationShape>;
const toFields = (fs: FieldIn[]): KindField[] =>
  fs.map((f) => ({ ...f, key: f.key || f.label, type: f.type ?? "text" })) as unknown as KindField[];
const toRelations = (rs: RelationIn[]): KindRelation[] => rs as unknown as KindRelation[];

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_kinds",
      "The user's category registry: every kind of thing their vault tracks, with its field template and relations. A category IS a table IS its template. Read this before extracting — reuse these kinds and field keys wherever they fit. The `id` is what update_category / delete_category take.",
      {},
      async (_args, extra) => {
        const { userId, orgId } = await caller(extra);
        const { listKinds } = await import("@/lib/datamodo/kinds");
        const kinds = await listKinds(orgId, userId);
        return json(kinds.map((k) => ({
          id: k.id,
          kind: k.kind,
          label: k.label,
          builtin: k.builtin,
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
      "extraction_briefing",
      "Call this FIRST, before extracting anything into the vault: one call returns the extraction rules for submit_extraction plus this user's whole steering context — their categories with field templates, entities ALREADY in their graph related to this text (reuse those EXACT labels), their concept vocabulary, business context, and agents. With this briefing your extraction lands exactly like the app's own pipeline.",
      { text: z.string().min(1).max(50_000).describe("The content you are about to extract from") },
      async ({ text: input }, extra) => {
        const { userId, orgId } = await caller(extra);
        const { listKinds } = await import("@/lib/datamodo/kinds");
        const { primeKnownEntities } = await import("@/lib/datamodo/priming");
        const { conceptsForPrompt } = await import("@/lib/datamodo/priming-core");
        const { getOnboardingContext } = await import("@/lib/datamodo/settings");
        // Every leg fail-soft — a briefing must never block an extraction.
        const [kinds, known, conceptRows, agents, onboarding] = await Promise.all([
          listKinds(orgId, userId).catch(() => []),
          primeKnownEntities(orgId, input).catch(() => []),
          prisma.entities
            .findMany({
              where: { org_id: orgId, kind: "concept", merged_into: null },
              select: { canonical_label: true },
              orderBy: { support: "desc" },
              take: 30,
            })
            .catch(() => []),
          prisma.agents
            .findMany({
              where: { org_id: orgId, status: "active", NOT: { purpose_text: null } },
              select: { name: true, purpose_text: true },
              take: 6,
            })
            .catch(() => []),
          getOnboardingContext(userId).catch(() => ({ businessContext: null })),
        ]);
        return json({
          rules: EXTRACTION_DOCTRINE,
          businessContext: onboarding.businessContext ?? null,
          agents: agents.map((a) => ({ name: a.name, purpose: (a.purpose_text ?? "").slice(0, 200) })),
          categories: kinds.map((k) => ({
            kind: k.kind,
            label: k.label,
            fields: k.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
            relations: (k.relations ?? []).map((r) => ({ predicate: r.predicate, targetKind: r.targetKind ?? null })),
          })),
          knownEntities: known.map((k) => ({ kind: k.kind, label: k.label, ...(k.hint ? { hint: k.hint } : {}) })),
          concepts: conceptsForPrompt(known, conceptRows.map((c) => c.canonical_label)),
        });
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
        // Org scoping: the table (a kind — one object) must belong to the caller's workspace.
        const ds = await prisma.kinds.findFirst({ where: { id: tableId, org_id: orgId }, select: { id: true, label: true, plural: true } });
        if (!ds) return text("No table with that id — call list_tables for current ids.");
        const { listDatasetRows } = await import("@/lib/datamodo/datasets");
        const { rows, total } = await listDatasetRows(ds.id, { limit: limit ?? 50, offset: offset ?? 0 });
        return json({ table: ds.plural?.trim() || `${ds.label}s`, total, offset: offset ?? 0, rows: rows.map((r) => r.data) });
      },
    );

    server.tool(
      "list_pull_requests",
      "The user's open pull requests — the vault's review loop: entity merges, fact conflicts, and proposed categories waiting on a decision, newest first, each WITH its evidence (the diff, the two sides, the proposed template). Surface them conversationally when relevant; resolve one ONLY when the user explicitly decides.",
      {},
      async (_args, extra) => {
        const { orgId } = await caller(extra);
        const { listPendingReviews } = await import("@/lib/datamodo/reviews");
        const reviews = await listPendingReviews(orgId);
        if (reviews.length === 0) return text("No open pull requests — nothing waiting on a decision.");
        return json(reviews);
      },
    );

    server.tool(
      "resolve_pull_request",
      "Apply the user's decision on a pull request — the SAME real side-effects as the app's Review tab: accept dispatches by kind (merge two entities, add held facts, create a proposed category, grow a template). Requires the user's explicit yes/no; never decide for them.",
      { pullRequestId: z.string().min(1).describe("The review id from list_pull_requests"), accept: z.boolean() },
      async ({ pullRequestId, accept }, extra) => {
        const { orgId } = await caller(extra);
        const { acceptReview, rejectReview } = await import("@/lib/datamodo/reviews");
        try {
          if (accept) await acceptReview(orgId, pullRequestId);
          else await rejectReview(orgId, pullRequestId);
          return text(`${accept ? "✓ approved" : "✗ declined"} — applied for real.`);
        } catch {
          return text("Could not apply — the pull request may already be resolved. Call list_pull_requests for current ones.");
        }
      },
    );

    server.tool(
      "list_commits",
      "The vault's commit log — what datamodo has filed and MERGED: each captured message is a commit, the facts it wrote are the diff (a correction shows `~ was → now`, the rest `+ added`), newest first. Use it to show the user what just landed after filing, or `entityId` for one entity's history.",
      {
        entityId: z.string().optional().describe("Narrow to commits touching this entity (from search_entities)"),
        limit: z.number().int().min(1).max(100).optional(),
      },
      async ({ entityId, limit }, extra) => {
        const { orgId } = await caller(extra);
        const { loadCommitLog } = await import("@/lib/datamodo/timeline-load");
        const commits = await loadCommitLog(orgId, { entityId: entityId ?? null, limit: limit ?? 25 });
        if (commits.length === 0) return text("No commits yet — nothing has been filed.");
        return json(commits.map((c) => ({
          itemId: c.itemId,
          at: c.ts,
          channel: c.channel,
          title: c.title,
          added: c.added,
          changed: c.changed,
          changes: c.lines.map((l) => ({
            op: l.op,
            subject: l.subject?.label ?? null,
            predicate: l.predicate,
            value: l.value,
            ...(l.was !== undefined ? { was: l.was } : {}),
          })),
        })));
      },
    );

    server.tool(
      "submit_extraction",
      "File what YOU extracted from a message/document into the vault. Call extraction_briefing first — it carries the rules and the user's context. You are the extractor; the server stays deterministic (canonicalization, entity resolution, dedup, supersession, review routing). Include sourceText so provenance and the commit log work; add note{} when the content is a substantive write-up worth keeping as a page.",
      {
        itemId: z.string().optional().describe("A queued item's id from process_inbox — attaches this extraction to it (provenance, commit log) and marks it processed"),
        sourceText: z.string().max(20000).optional().describe("The raw message/document text this was extracted from (ignored when itemId is given)"),
        subject: z.string().max(300).optional().describe("A short title for the source (email subject etc.)"),
        note: z
          .object({
            title: z.string().min(1).max(120).describe("≤60 chars, names what it's about"),
            body: z.string().min(1).max(20_000).describe("The user's points distilled into clean markdown — faithful, never padded"),
          })
          .optional()
          .describe("For substantive write-ups (meeting notes, plans, braindumps): the note page datamodo authors — becomes a note node whose body renders as a markdown page, edged to the extracted entities"),
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
      async ({ itemId: givenItemId, sourceText, subject, note, extraction }, extra) => {
        const { userId, orgId } = await caller(extra);
        // Strict validation beyond the transport schema (dangling localIds,
        // caps, date format) — bounce fixable errors back to the model.
        const parsed = parseExtraction(extraction);
        if (!parsed.ok) return text(parsed.error);
        // A note node's identity is its source item (natural key note:<itemId>)
        // — validate BEFORE any write so a bounce can't half-file.
        if (note && !givenItemId && !sourceText?.trim()) {
          return text("A note needs provenance — include sourceText (or itemId) so the note page has a source.");
        }

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
        const { ingestExtraction, normalizeKey } = await import("@/lib/datamodo/knowledge");
        const { llmForUser } = await import("@/lib/datamodo/llm-for-user");
        const llm = await llmForUser(userId);
        const result = await ingestExtraction(orgId, userId, itemId, parsed.extraction, llm);

        // The note page — the SAME author path as the chat pipeline
        // (buildNoteExtraction: note node keyed to the source item, mentions/
        // about edges to the extracted entities, body_md = the markdown page).
        // Best-effort: a note hiccup never un-files the extraction.
        let notedTitle: string | null = null;
        if (note && itemId) {
          try {
            const { buildNoteExtraction, NOTE_KIND } = await import("@/lib/datamodo/document-extraction");
            const noteX = buildNoteExtraction(itemId, note, parsed.extraction);
            await ingestExtraction(orgId, userId, itemId, noteX, llm);
            const ent = await prisma.entities.findFirst({
              where: { org_id: orgId, kind: NOTE_KIND, normalized_key: normalizeKey(noteX.entities[0]), merged_into: null },
              select: { id: true },
            });
            if (ent) {
              await prisma.entities.update({
                where: { id: ent.id, org_id: orgId },
                data: { body_md: note.body, updated_at: new Date() },
              });
              notedTitle = noteX.entities[0].label;
            }
          } catch (e) {
            console.error("[mcp] note authoring failed (extraction already filed)", e);
          }
        }

        // The CLIENT extracted — mark the item done (either path) so the cron
        // tick never runs the server-side extractor over it again.
        if (itemId) {
          const { EXTRACTION_VERSION } = await import("@/lib/datamodo/extract");
          await prisma.items
            .update({ where: { id: itemId }, data: { status: "analyzed", error: null, extraction_version: EXTRACTION_VERSION } })
            .catch((e) => console.error("[mcp] item status update failed", e));
        }
        return json({ filed: true, sourceItemId: itemId, ...(notedTitle ? { note: notedTitle } : {}), ...result });
      },
    );

    server.tool(
      "run_extraction",
      "Run the FULL datamodo extraction on text for the user: the server captures it and runs its own pipeline (extract → resolve → dedup → supersede → route reviews) synchronously, then returns what landed. The 'just file this' path — unlike submit_extraction YOU don't extract; unlike capture_message it runs now and reports. Follow with list_commits to show what merged.",
      {
        text: z.string().min(1).max(50_000).describe("The message/document text to file"),
        subject: z.string().max(300).optional().describe("A short title (email-subject style)"),
      },
      async ({ text: bodyText, subject }, extra) => {
        const { userId, orgId } = await caller(extra);
        const { ingest, IngestError } = await import("@/lib/ingest/store");
        let itemId: string;
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
          if (r.deduped) return json({ filed: true, deduped: true, itemId: r.itemId, note: "Already filed earlier — nothing new." });
          itemId = r.itemId;
        } catch (e) {
          if (e instanceof IngestError) return text(`Could not capture: ${e.message}`);
          throw e;
        }
        // The SAME server extractor every channel's cron tick runs — but inline,
        // so the result comes back in this call. Fail-soft: on error the item
        // stays queued for the next tick rather than losing the capture.
        try {
          const { runExtractionForItem } = await import("@/lib/datamodo/extract");
          const result = await runExtractionForItem(itemId);
          return json({ filed: true, itemId, ...result.knowledge });
        } catch (e) {
          console.error("[mcp] run_extraction pipeline failed (item queued)", e);
          return json({ filed: true, itemId, extraction: "queued", note: "Captured; the server will finish extraction on the next tick." });
        }
      },
    );

    server.tool(
      "list_agents",
      "The user's agents — who files each kind of thing. Returns the id (for update_agent / set_agent_status / delete_agent), name, purpose, channels, mode, status.",
      {},
      async (_args, extra) => {
        const { orgId } = await caller(extra);
        const { listAgents } = await import("@/lib/datamodo/agents");
        const agents = await listAgents(orgId);
        if (agents.length === 0) return text("No agents yet.");
        return json(agents.map((a) => ({
          id: a.id,
          name: a.name,
          purpose: a.purpose_text ?? null,
          channels: a.channels ?? [],
          mode: a.mode,
          status: a.status,
        })));
      },
    );

    server.tool(
      "suggest_category_template",
      "Draft a category's fields + relations from just its name (AI, no write). Propose the template to the user, then create_category with what they approve.",
      { name: z.string().min(1).max(80), hint: z.string().max(500).optional().describe("How the user uses it, for a better draft") },
      async ({ name, hint }, extra) => {
        const { userId } = await caller(extra);
        const { suggestKindTemplate } = await import("@/lib/datamodo/kinds");
        return json(await suggestKindTemplate(userId, name, hint ?? null));
      },
    );

    server.tool(
      "create_category",
      "Create a category — which IS its table and its template, one object. Give it a label (optionally fields + relations; draft them first with suggest_category_template). Creates the category AND materializes its table so its rows show up in the app immediately.",
      {
        label: z.string().min(1).max(80),
        plural: z.string().max(80).optional(),
        icon: z.string().max(8).optional().describe("one emoji"),
        color: z.string().max(16).optional(),
        description: z.string().max(300).optional(),
        fields: z.array(fieldShape).max(20).optional(),
        relations: z.array(relationShape).max(10).optional(),
      },
      async ({ label, plural, icon, color, description, fields, relations }, extra) => {
        const { userId, orgId } = await caller(extra);
        const { createKind } = await import("@/lib/datamodo/kinds");
        const { materializeKindTable } = await import("@/lib/datamodo/datasets");
        try {
          const kind = await createKind(orgId, userId, {
            label, plural, icon, color, description,
            fields: toFields(fields ?? []),
            relations: toRelations(relations ?? []),
          });
          let table: { datasetId: string; name: string } | null = null;
          try {
            table = await materializeKindTable(orgId, userId, kind.id!);
          } catch (e) {
            console.error("[mcp] table materialize failed (category created)", e);
          }
          return json({ created: true, category: { id: kind.id, kind: kind.kind, label: kind.label }, table });
        } catch (e) {
          const msg = String((e as Error)?.message ?? e);
          return text(msg.includes("Unique") ? "A category with that name already exists." : `Could not create: ${msg}`);
        }
      },
    );

    server.tool(
      "update_category",
      "Edit a category's template — label, fields, relations, description, icon, color. Get the id from list_kinds. Only the fields you pass change; omit a field to keep it. The slug (kind) is identity and cannot change.",
      {
        categoryId: z.string().min(1),
        label: z.string().max(80).optional(),
        plural: z.string().max(80).optional(),
        icon: z.string().max(8).optional(),
        color: z.string().max(16).optional(),
        description: z.string().max(300).optional(),
        fields: z.array(fieldShape).max(20).optional(),
        relations: z.array(relationShape).max(10).optional(),
      },
      async ({ categoryId, label, plural, icon, color, description, fields, relations }, extra) => {
        const { userId, orgId } = await caller(extra);
        const { listKinds, updateKind } = await import("@/lib/datamodo/kinds");
        // updateKind REPLACES the whole template, so default every unspecified
        // field to the current value — a partial call must never wipe the rest.
        const cur = (await listKinds(orgId, userId)).find((k) => k.id === categoryId);
        if (!cur) return text("No category with that id — call list_kinds for current ids.");
        try {
          const kind = await updateKind(orgId, categoryId, {
            label: label ?? cur.label,
            plural: plural ?? cur.plural,
            icon: icon ?? cur.icon,
            color: color ?? cur.color,
            description: description ?? cur.description,
            fields: fields === undefined ? cur.fields : toFields(fields),
            relations: relations === undefined ? cur.relations : toRelations(relations),
          });
          return json({ updated: true, category: { id: kind.id, kind: kind.kind, label: kind.label } });
        } catch (e) {
          return text(`Could not update — ${String((e as Error)?.message ?? e)}.`);
        }
      },
    );

    server.tool(
      "delete_category",
      "Delete a category and its template. GUARDED — pass confirm:true. Entities of this kind keep their kind label; only the registry/template entry goes away (the table is not deleted here). Get the id from list_kinds.",
      { categoryId: z.string().min(1), confirm: z.boolean().describe("Must be true — deletion is real") },
      async ({ categoryId, confirm }, extra) => {
        const { orgId } = await caller(extra);
        if (!confirm) return text("Not deleted — pass confirm:true to remove this category.");
        const { deleteKind } = await import("@/lib/datamodo/kinds");
        try {
          await deleteKind(orgId, categoryId);
          return text("✓ category deleted.");
        } catch (e) {
          return text(`Could not delete — ${String((e as Error)?.message ?? e)}. Call list_kinds for current ids.`);
        }
      },
    );

    server.tool(
      "set_context",
      "Save the user's business context — a plain-language 'what I do / what to track' that steers EVERY future extraction (the strongest steer there is). Overwrites the stored context; pass answers for structured onboarding fields.",
      {
        businessContext: z.string().max(4000).optional().describe("What the user does / what their vault should focus on"),
        answers: z.record(z.string(), z.unknown()).optional().describe("Optional structured onboarding answers"),
      },
      async ({ businessContext, answers }, extra) => {
        const { userId } = await caller(extra);
        if (businessContext === undefined && answers === undefined) {
          return text("Nothing to save — pass businessContext and/or answers.");
        }
        const { saveOnboarding } = await import("@/lib/datamodo/settings");
        await saveOnboarding(userId, { businessContext, answers: answers as Record<string, unknown> | undefined });
        return text("✓ context saved — it will steer future extractions.");
      },
    );

    server.tool(
      "create_agent",
      "Create an agent that files a kind of thing from the user's messages. Plan-gated exactly like the app (agent count; auto-mode is a Pro feature).",
      {
        name: z.string().min(1).max(80),
        purposeText: z.string().max(500).optional().describe("What this agent collects — steers its extraction"),
        channels: z.array(z.string()).max(8).optional().describe("e.g. gmail, whatsapp"),
        mode: z.enum(["auto", "ping"]).optional(),
        freestyle: z.boolean().optional(),
      },
      async ({ name, purposeText, channels, mode, freestyle }, extra) => {
        const { userId, orgId } = await caller(extra);
        const { createAgentGuarded } = await import("@/lib/datamodo/agents");
        try {
          const a = await createAgentGuarded(orgId, userId, { name, purposeText, channels, mode, freestyle });
          return json({ created: true, agent: { id: a.id, name: a.name } });
        } catch (e) {
          return text(`Could not create agent — ${String((e as Error)?.message ?? e)}`);
        }
      },
    );

    server.tool(
      "update_agent",
      "Edit an agent — name, purpose, channels, mode, or activate/pause. Only the fields you pass change. Get the id from list_agents.",
      {
        agentId: z.string().min(1),
        name: z.string().max(80).optional(),
        purposeText: z.string().max(500).optional(),
        channels: z.array(z.string()).max(8).optional(),
        mode: z.enum(["auto", "ping"]).optional(),
        status: z.enum(["active", "paused"]).optional(),
      },
      async ({ agentId, ...patch }, extra) => {
        const { orgId } = await caller(extra);
        const owned = await prisma.agents.findFirst({ where: { id: agentId, org_id: orgId }, select: { id: true } });
        if (!owned) return text("No agent with that id — call list_agents for current ids.");
        const { updateAgent } = await import("@/lib/datamodo/agents");
        await updateAgent(agentId, patch);
        return text("✓ agent updated.");
      },
    );

    server.tool(
      "set_agent_status",
      "Pause or activate an agent (a paused agent stops filing new mail). Get the id from list_agents.",
      { agentId: z.string().min(1), status: z.enum(["active", "paused"]) },
      async ({ agentId, status }, extra) => {
        const { orgId } = await caller(extra);
        const owned = await prisma.agents.findFirst({ where: { id: agentId, org_id: orgId }, select: { id: true } });
        if (!owned) return text("No agent with that id — call list_agents for current ids.");
        const { setAgentStatus } = await import("@/lib/datamodo/agents");
        await setAgentStatus(agentId, status);
        return text(`✓ agent ${status}.`);
      },
    );

    server.tool(
      "delete_agent",
      "Delete an agent. GUARDED — pass confirm:true. The tables it filled are not deleted. Get the id from list_agents.",
      { agentId: z.string().min(1), confirm: z.boolean().describe("Must be true — deletion is real") },
      async ({ agentId, confirm }, extra) => {
        const { orgId } = await caller(extra);
        if (!confirm) return text("Not deleted — pass confirm:true to remove this agent.");
        const owned = await prisma.agents.findFirst({ where: { id: agentId, org_id: orgId }, select: { id: true } });
        if (!owned) return text("No agent with that id — call list_agents for current ids.");
        const { deleteAgent } = await import("@/lib/datamodo/agents");
        await deleteAgent(agentId);
        return text("✓ agent deleted.");
      },
    );
  },
  {
    serverInfo: { name: "datamodo", version: "1.2.0" },
    // "Claude chat AS datamodo chat" (2026-07-17): the initialize response
    // carries the datamodo-mode doctrine — clients fold it into the system
    // context, so the model DECIDES when a turn belongs in the vault and
    // runs the same loops the app does (file · answer · review).
    instructions: MCP_INSTRUCTIONS,
  },
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
