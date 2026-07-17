import { prisma } from "@/lib/prisma";
import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import { embedTexts, embeddingsModel, toVectorLiteral } from "@/lib/llm/embeddings";
import type { KnowledgeEntityView, FactSourceView } from "./types";

// Knowledge layer: turn an extraction (entities + facts pulled from one message)
// into canonical, deduplicated, versioned knowledge — scoped per user (org_id).
//
// The costly-vs-cheap strategy (see docs/architecture.md): resolve deterministic
// matches for free, use blocking (trigram / ANN) to shrink fuzzy comparison to a
// handful of candidates, and only escalate the genuinely-ambiguous few. We NEVER
// compare a new record against the whole store.
//
// This is the skeleton: tiers 0 (deterministic) and 1 (trigram blocking) are
// implemented; the embedding + LLM-adjudication tiers are stubbed behind clear
// seams (see resolveEntity / adjudicateMatch). Everything runs today without them.

// --- Extraction input contract (what the LLM extractor will produce) ---------

export interface ExtractedEntity {
  /** Local id unique within this one extraction; facts reference it. */
  localId: string;
  kind: string; // 'person' | 'org' | 'invoice' | ...
  label: string;
  /** Strong identifiers if present: { email, phone, invoice_no, ... }. */
  naturalKeys?: Record<string, string>;
  /** Optional precomputed embedding for semantic blocking (tier 1b). */
  embedding?: number[];
}

export interface ExtractedFact {
  subjectLocalId: string;
  predicate: string;
  /** Single-valued attribute (supersede on change) vs multi-valued (accumulate). */
  cardinality?: "one" | "many";
  value:
    | { kind: "text"; text: string }
    | { kind: "number"; num: number; unit?: string }
    | { kind: "date"; date: string }
    | { kind: "entity"; entityLocalId: string };
  confidence?: number;
  snippet?: string;
}

export interface Extraction {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
}

export interface IngestExtractionResult {
  entitiesResolved: number;
  entitiesCreated: number;
  factsNew: number;
  factsDeduped: number;
  factsSuperseded: number;
}

// --- Tuning knobs ------------------------------------------------------------

// Trigram similarity this high = the same entity by surface text alone → resolve
// without spending an LLM call.
const TRGM_HIGH = 0.92;
// Semantic-match (LLM adjudication) confidence policy:
//   ≥ AUTO_MERGE → resolve to the canonical entity now ("call it Acme Group"),
//                  logged as an accepted review for transparency.
//   ≥ PROPOSE    → keep as a new entity but PROPOSE a merge for the user to
//                  validate (pending review, ranked by impact).
//   below        → treat as a genuinely new entity.
export const AUTO_MERGE = 0.85;
export const PROPOSE = 0.55;

// --- Normalization -----------------------------------------------------------

/** Deterministic tier-0 dedup key. Prefers a strong natural key; else a
 *  normalized label. Same key (per org+kind) == same entity, for free. */
export function normalizeKey(e: Pick<ExtractedEntity, "kind" | "label" | "naturalKeys">): string {
  const strong =
    e.naturalKeys?.email ??
    e.naturalKeys?.phone ??
    e.naturalKeys?.invoice_no ??
    e.naturalKeys?.id;
  if (strong) return `#${strong.trim().toLowerCase()}`;
  return e.label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents (combining diacritics)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalized representation of a fact's value, used in claim keys for
 *  multi-valued facts and to compare single-valued facts for equality. */
function valueSlot(v: ExtractedFact["value"], resolve: (localId: string) => string): string {
  switch (v.kind) {
    case "text":
      return "t:" + v.text.trim().toLowerCase();
    case "number":
      return "n:" + v.num + (v.unit ? ":" + v.unit : "");
    case "date":
      return "d:" + v.date;
    case "entity":
      return "e:" + resolve(v.entityLocalId);
  }
}

/** Slot identity: single-valued facts key on (subject, predicate); multi-valued
 *  facts include the value so several can coexist. */
function claimKey(fact: ExtractedFact, subjectId: string, slot: string): string {
  const base = `${subjectId}::${fact.predicate}`;
  return fact.cardinality === "many" ? `${base}::${slot}` : base;
}

// --- Entity resolution (the anti-degeneracy core) ----------------------------

interface EntityRow {
  id: string;
  org_id: string;
  owner_user_id: string | null;
  support: number;
}

/**
 * Resolve an extracted entity to a canonical entity id, creating one if it's
 * genuinely new. Tiered: exact key → trigram blocking → (stub) adjudication.
 */
export async function resolveEntity(
  orgId: string,
  ownerUserId: string | null,
  e: ExtractedEntity,
  llm?: LlmProvider,
  opts: { adjudicate?: boolean } = {},
): Promise<{ id: string; created: boolean }> {
  const key = normalizeKey(e);

  // Tier 0 — deterministic exact match. Free, kills most redundancy.
  const exact = await prisma.entities.findFirst({
    where: { org_id: orgId, kind: e.kind, normalized_key: key, merged_into: null },
    select: { id: true },
  });
  if (exact) {
    await bumpSupport(exact.id);
    return { id: exact.id, created: false };
  }

  // Tier 1 — blocking: only compare against the top trigram candidates for THIS
  // org, never the whole table.
  const candidates = await prisma.$queryRaw<MatchCandidate[]>`
    SELECT * FROM knowledge_match_entities(${orgId}::uuid, ${e.kind}, ${e.label}, 10)
  `;
  const top = candidates[0];

  // Strong surface-text match → resolve without an LLM call.
  if (top && top.sim >= TRGM_HIGH) {
    await bumpSupport(top.id);
    return { id: top.id, created: false };
  }

  // Tier 1b — semantic blocking: when surface text found little, recall
  // candidates by embedding proximity (acronyms, paraphrases, translations).
  // ANN similarity only RECALLS — resolution still goes through adjudication;
  // cosine closeness on short labels is never trusted to auto-merge.
  if (e.embedding && candidates.length < 5) {
    try {
      const vec = toVectorLiteral(e.embedding);
      // embedding_model gate: only vectors from the CURRENT space are
      // comparable — rows embedded under another model fall out of ANN
      // recall (trigram already covered them) instead of poisoning it.
      const ann = await prisma.$queryRaw<MatchCandidate[]>`
        SELECT id, canonical_label, (1 - (embedding <=> ${vec}::vector))::real AS sim
          FROM entities
         WHERE org_id = ${orgId}::uuid AND kind = ${e.kind}
           AND merged_into IS NULL AND embedding IS NOT NULL
           AND embedding_model = ${embeddingsModel()}
         ORDER BY embedding <=> ${vec}::vector
         LIMIT 5`;
      const seen = new Set(candidates.map((c) => c.id));
      for (const c of ann) if (!seen.has(c.id) && c.sim >= 0.5) candidates.push(c);
    } catch (err) {
      console.error("[knowledge] ANN blocking failed", err);
    }
  }

  // Tier 2/3 — ambiguous: ask the model whether it's the same real-world entity,
  // with a confidence. Candidates go in ENRICHED (keys, support, top facts) so
  // doubt is judged on identity evidence, not label similarity alone.
  // Efficiency: never spend the call on hopeless candidates — the blocking
  // function's substring leg can surface sim≈0.1 matches; a floor drops them
  // (they'd never clear PROPOSE anyway) and a cap keeps the judge prompt
  // small. No candidate above the floor = new entity, zero LLM cost.
  // opts.adjudicate === false (bulk imports): deterministic tiers only — a
  // thousand-note migration must never fan out LLM calls; the consolidation
  // worker proposes any fuzzy merges later on its own budget.
  const worthJudging =
    opts.adjudicate === false
      ? []
      : candidates.filter((c) => c.sim >= 0.25).sort((a, b) => b.sim - a.sim).slice(0, 3);
  const verdict = worthJudging.length
    ? await adjudicateMatch(e, await enrichMatchCandidates(orgId, worthJudging), llm)
    : { matchId: null as string | null, confidence: 0, reason: "" };

  // High confidence → resolve to the canonical entity now, logged for audit.
  if (verdict.matchId && verdict.confidence >= AUTO_MERGE) {
    await bumpSupport(verdict.matchId);
    await createMergeReview(orgId, ownerUserId, {
      sourceId: null,
      targetId: verdict.matchId,
      confidence: verdict.confidence,
      status: "accepted",
      detail: { auto: true, parsedLabel: e.label, reason: verdict.reason },
    });
    return { id: verdict.matchId, created: false };
  }

  // Otherwise create a new entity...
  const created = await prisma.entities.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind: e.kind,
      canonical_label: e.label,
      normalized_key: key,
      natural_keys: e.naturalKeys ?? {},
      support: 1,
    },
    select: { id: true },
  });
  // The vector column is Unsupported in Prisma — attach the embedding raw,
  // stamped with the space that produced it.
  if (e.embedding) {
    await prisma.$executeRaw`
      UPDATE entities SET embedding = ${toVectorLiteral(e.embedding)}::vector,
                          embedding_model = ${embeddingsModel()}
       WHERE id = ${created.id}::uuid`
      .catch((err) => console.error("[knowledge] embedding store failed", err));
  }

  // ...and, if there's a plausible-but-uncertain match, PROPOSE a merge for the
  // user to validate (never a silent merge — a wrong merge corrupts data).
  if (verdict.matchId && verdict.confidence >= PROPOSE) {
    await createMergeReview(orgId, ownerUserId, {
      sourceId: created.id,
      targetId: verdict.matchId,
      confidence: verdict.confidence,
      status: "pending",
      detail: { parsedLabel: e.label, reason: verdict.reason },
    });
  }
  return { id: created.id, created: true };
}

export interface MatchCandidate {
  id: string;
  canonical_label: string;
  sim: number;
  /** Enrichment (topFactsForEntities / enrichMatchCandidates): identity
   *  metadata the adjudicator judges WITH, not just labels. */
  naturalKeys?: Record<string, string>;
  support?: number;
  facts?: string[];
}

/** Top current facts per entity, rendered "predicate: value" — the metadata
 *  context for merge adjudication (user call 2026-07-16: doubt should be
 *  judged with the entities' facts, not labels alone). One query, capped. */
export async function topFactsForEntities(
  orgId: string,
  entityIds: string[],
  perEntity = 4,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (entityIds.length === 0) return out;
  try {
    const rows = await prisma.$queryRaw<
      { subject_entity_id: string; predicate: string; value_text: string | null; value_num: number | null; value_date: Date | null; unit: string | null; object_label: string | null }[]
    >`
      SELECT f.subject_entity_id, f.predicate, f.value_text, f.value_num::float8 AS value_num,
             f.value_date, f.unit, o.canonical_label AS object_label
        FROM facts f
        LEFT JOIN entities o ON o.id = f.object_entity_id
       WHERE f.org_id = ${orgId}::uuid AND f.valid_to IS NULL
         AND f.subject_entity_id = ANY(${entityIds}::uuid[])
         AND (f.object_entity_id IS NOT NULL OR f.value_text IS NOT NULL
              OR f.value_num IS NOT NULL OR f.value_date IS NOT NULL)
       ORDER BY f.subject_entity_id, f.confidence DESC, f.created_at DESC`;
    for (const r of rows) {
      const list = out.get(r.subject_entity_id) ?? [];
      if (list.length >= perEntity) continue;
      const value =
        r.object_label ?? (r.value_num != null ? `${r.value_num}${r.unit ? " " + r.unit : ""}` : null) ??
        (r.value_date ? dateOnly(r.value_date) : null) ?? r.value_text ?? "—";
      list.push(`${r.predicate}: ${value}`);
      out.set(r.subject_entity_id, list);
    }
  } catch (e) {
    console.error("[knowledge] topFactsForEntities failed", e);
  }
  return out;
}

/** Attach natural keys, support, and top facts to blocking candidates so the
 *  adjudicator sees WHO each candidate is. Fail-soft: enrichment errors just
 *  leave the plain labels. */
export async function enrichMatchCandidates(
  orgId: string,
  candidates: MatchCandidate[],
): Promise<MatchCandidate[]> {
  if (candidates.length === 0) return candidates;
  try {
    const ids = candidates.map((c) => c.id);
    const [ents, facts] = await Promise.all([
      prisma.entities.findMany({
        where: { org_id: orgId, id: { in: ids } },
        select: { id: true, natural_keys: true, support: true },
      }),
      topFactsForEntities(orgId, ids),
    ]);
    const byId = new Map(ents.map((e) => [e.id, e]));
    return candidates.map((c) => {
      const e = byId.get(c.id);
      return {
        ...c,
        naturalKeys: (e?.natural_keys as Record<string, string>) ?? {},
        support: e?.support ?? undefined,
        facts: facts.get(c.id) ?? [],
      };
    });
  } catch (e) {
    console.error("[knowledge] candidate enrichment failed", e);
    return candidates;
  }
}

/**
 * Decide whether a newly-parsed entity is the same real-world thing as one of
 * the blocking candidates, with a confidence. Uses the LLM (the semantic
 * tiebreak). Fails safe: any error → no match (→ new entity), never a bad merge.
 */
export async function adjudicateMatch(
  e: ExtractedEntity,
  candidates: MatchCandidate[],
  llm: LlmProvider = getLlmProvider(),
  opts: { subjectFacts?: string[] } = {},
): Promise<{ matchId: string | null; confidence: number; reason: string }> {
  // Candidates carry their metadata when the caller enriched them
  // (enrichMatchCandidates) — the judge sees WHO each one is, not just a name.
  const list = candidates
    .map((c) => {
      const keys = c.naturalKeys && Object.keys(c.naturalKeys).length ? ` keys=${JSON.stringify(c.naturalKeys)}` : "";
      const seen = c.support != null ? ` seen ${c.support}×` : "";
      const facts = c.facts?.length ? ` · known facts: ${c.facts.join("; ")}` : "";
      return `- id=${c.id} label="${c.canonical_label}"${keys}${seen}${facts}`;
    })
    .join("\n");
  const system =
    "You decide whether a newly-parsed entity refers to the SAME real-world thing " +
    "as one of several existing candidates. Account for abbreviations, legal suffixes " +
    "(Inc/LLC/Group/Ltd), and common name variations, and USE the candidates' known " +
    "facts and identifiers as evidence — matching identifiers are near-proof, " +
    "contradicting identifiers are near-disproof. Do NOT merge genuinely " +
    "different things that merely share a word. Respond with ONLY JSON: " +
    '{"matchId": <candidate id string or null>, "confidence": <0..1>, "reason": "<one short sentence>"}.';
  const user =
    `New entity: kind="${e.kind}", label="${e.label}"` +
    (e.naturalKeys && Object.keys(e.naturalKeys).length ? `, keys=${JSON.stringify(e.naturalKeys)}` : "") +
    (opts.subjectFacts?.length ? `\nIts known facts: ${opts.subjectFacts.join("; ")}` : "") +
    `\nExisting candidates:\n${list}\n\nWhich candidate id (if any) is the same real-world ${e.kind}, and why?`;
  try {
    const r = await llm.chatJSON<{ matchId: string | null; confidence: number; reason?: string }>({
      model: llm.models.extract,
      system,
      user,
      maxTokens: 4096,
      temperature: 0,
    });
    const matchId = r.matchId && candidates.some((c) => c.id === r.matchId) ? r.matchId : null;
    return {
      matchId,
      confidence: typeof r.confidence === "number" ? r.confidence : 0,
      reason: (r.reason ?? "").toString().slice(0, 240),
    };
  } catch {
    return { matchId: null, confidence: 0, reason: "" };
  }
}

interface MergeReviewArgs {
  sourceId: string | null; // the newly-parsed entity (null when auto-resolved)
  targetId: string; // the proposed canonical entity
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  detail: Record<string, unknown>;
}

/** Log/propose an entity merge, ranked by how many edges the target already has. */
export async function createMergeReview(
  orgId: string,
  ownerUserId: string | null,
  args: MergeReviewArgs,
): Promise<void> {
  const impact = await countEntityEdges(orgId, args.targetId);
  await prisma.knowledge_reviews.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind: "entity_merge",
      status: args.status,
      confidence: args.confidence,
      impact,
      source_entity_id: args.sourceId,
      target_entity_id: args.targetId,
      detail: args.detail as unknown as import("@prisma/client").Prisma.InputJsonValue,
      resolved_at: args.status === "pending" ? null : new Date(),
    },
  });
}

/** How many facts reference this entity (as subject or object) — its edge count. */
async function countEntityEdges(orgId: string, entityId: string): Promise<number> {
  const [subjCount, objCount] = await Promise.all([
    prisma.facts.count({ where: { org_id: orgId, subject_entity_id: entityId } }),
    prisma.facts.count({ where: { org_id: orgId, object_entity_id: entityId } }),
  ]);
  return subjCount + objCount;
}

/** Record a superseded fact as a conflict the user can review, ranked by how
 *  corroborated the old value was (more sources = more impactful a change). */
async function createConflictReview(
  orgId: string,
  ownerUserId: string | null,
  args: { oldId: string; newId: string; subjectId: string; predicate: string },
): Promise<void> {
  const count = await prisma.fact_sources.count({ where: { fact_id: args.oldId } });
  await prisma.knowledge_reviews.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind: "fact_conflict",
      status: "pending",
      confidence: null,
      impact: count + 1,
      old_fact_id: args.oldId,
      new_fact_id: args.newId,
      detail: { predicate: args.predicate },
    },
  });
}

/** File a document's template-restrained facts as a reviewable decision:
 *  accept replays `detail.extraction` through ingest ("add them anyway"),
 *  reject discards. Nothing is applied at filing time. */
export async function createOffTemplateReview(
  orgId: string,
  ownerUserId: string | null,
  args: {
    itemId: string | null;
    docLabel: string;
    docKind: string | null;
    extraction: Extraction;
    display: unknown[]; // pre-rendered card lines (OffTemplateDisplayFact[])
  },
): Promise<void> {
  await prisma.knowledge_reviews.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind: "off_template",
      status: "pending",
      confidence: null,
      impact: args.display.length,
      item_id: args.itemId,
      detail: {
        docLabel: args.docLabel,
        docKind: args.docKind,
        extraction: args.extraction,
        facts: args.display,
      } as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  });
}

/** Surface a low-confidence extraction for the user to confirm ("did we
 *  understand this message?"). High-confidence extractions file silently. */
export async function createExtractionReview(
  orgId: string,
  ownerUserId: string | null,
  args: { itemId: string; snippet: string; confidence: number; factCount: number },
): Promise<void> {
  await prisma.knowledge_reviews.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind: "extraction",
      status: "pending",
      confidence: args.confidence,
      impact: args.factCount,
      item_id: args.itemId,
      detail: { snippet: args.snippet.slice(0, 400) },
    },
  });
}

/** Usage-weighted retention (GRAPH_PIPELINE.md §10b): stamp the entities a
 *  retrieval actually SURFACED (answer citations, graph seeds, page opens) so
 *  consolidation never prunes what the user still reads. Raw SQL + fail-soft:
 *  a deployment that hasn't applied migration 20260716210000 yet just no-ops. */
export async function touchEntities(orgId: string, entityIds: string[]): Promise<void> {
  const ids = [...new Set(entityIds)].filter(Boolean);
  if (ids.length === 0) return;
  try {
    await prisma.$executeRaw`
      UPDATE entities SET last_used_at = now()
       WHERE org_id = ${orgId}::uuid AND id = ANY(${ids}::uuid[])`;
  } catch {
    /* column not migrated yet / bad id — the read path never fails on this */
  }
}

async function bumpSupport(id: string): Promise<void> {
  // Atomic in the database (support = support + 1) — safe under concurrent
  // per-entity extraction, and one round-trip instead of two.
  await prisma.entities.update({
    where: { id },
    data: { support: { increment: 1 }, updated_at: new Date() },
  });
}

/**
 * Merge duplicate entity `loserId` into `winnerId`: re-point everything hanging
 * off it (facts, document chunks, projected rows, body), tombstone it. Merge
 * moves IDENTITY only — no stored content (blobs, chunk text, markdown) is ever
 * rewritten. Intended for the async compaction pass, not the hot path.
 */
export async function mergeEntities(
  orgId: string,
  loserId: string,
  winnerId: string,
): Promise<void> {
  await prisma.facts.updateMany({
    where: { org_id: orgId, subject_entity_id: loserId },
    data: { subject_entity_id: winnerId },
  });
  await prisma.facts.updateMany({
    where: { org_id: orgId, object_entity_id: loserId },
    data: { object_entity_id: winnerId },
  });
  // Thick-node payloads follow the identity: the loser's document passages and
  // any table rows projected from it must not stay attached to the tombstone.
  await prisma.doc_chunks.updateMany({
    where: { org_id: orgId, entity_id: loserId },
    data: { entity_id: winnerId },
  });
  await prisma.dataset_rows.updateMany({
    where: { subject_entity_id: loserId },
    data: { subject_entity_id: winnerId },
  });
  const [loser, winner] = await Promise.all([
    prisma.entities.findUnique({ where: { id: loserId }, select: { body_md: true } }),
    prisma.entities.findUnique({ where: { id: winnerId }, select: { body_md: true } }),
  ]);
  if (loser?.body_md && !winner?.body_md) {
    await prisma.entities.update({ where: { id: winnerId, org_id: orgId }, data: { body_md: loser.body_md } });
  }
  await prisma.entities.update({ where: { id: loserId, org_id: orgId }, data: { merged_into: winnerId } });
}

// --- Fact upsert (dedup + contradiction handling) ----------------------------

interface FactValueCols {
  value_text: string | null;
  value_num: number | null;
  value_date: string | null;
  unit: string | null;
  object_entity_id: string | null;
}

function valueColumns(v: ExtractedFact["value"], resolve: (id: string) => string): FactValueCols {
  const cols: FactValueCols = { value_text: null, value_num: null, value_date: null, unit: null, object_entity_id: null };
  if (v.kind === "text") cols.value_text = v.text;
  else if (v.kind === "number") { cols.value_num = v.num; cols.unit = v.unit ?? null; }
  else if (v.kind === "date") cols.value_date = v.date;
  else if (v.kind === "entity") cols.object_entity_id = resolve(v.entityLocalId);
  return cols;
}

type FactOutcome = "new" | "deduped" | "superseded";

/** Normalize a date-ish value (Prisma returns Date for @db.Date columns; the
 *  LLM hands us "YYYY-MM-DD" strings) to a comparable YYYY-MM-DD, or null. */
function dateOnly(v: Date | string | null): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Upsert one fact into the canonical store. Single indexed lookup on claim_key —
 * no scan. Same slot+value → add provenance (dedup). Same slot, new value →
 * supersede (append-only). New slot → insert.
 */
async function upsertFact(
  orgId: string,
  ownerUserId: string | null,
  subjectId: string,
  fact: ExtractedFact,
  sourceItemId: string | null,
  resolve: (localId: string) => string,
): Promise<FactOutcome> {
  const slot = valueSlot(fact.value, resolve);
  const key = claimKey(fact, subjectId, slot);
  const cols = valueColumns(fact.value, resolve);
  const now = new Date();

  const current = await prisma.facts.findFirst({
    where: { org_id: orgId, claim_key: key, valid_to: null },
    select: { id: true, value_text: true, value_num: true, value_date: true, object_entity_id: true },
  });

  const addSource = async (factId: string) => {
    // NULLs are distinct in the (fact_id, source_item_id) unique index, so a
    // null source can't participate in an ON CONFLICT upsert — always insert it
    // (matches the original onConflict semantics). Only dedupe when we have an id.
    // Storage: snippets are QUOTES, not transcripts — cap them (an LLM can
    // hand back a whole paragraph; ~280 chars carries any evidence quote).
    const snippet = fact.snippet ? fact.snippet.slice(0, 280) : null;
    if (sourceItemId === null) {
      await prisma.fact_sources.create({
        data: {
          org_id: orgId,
          fact_id: factId,
          source_item_id: null,
          snippet,
          extracted_at: now,
        },
      });
      return;
    }
    await prisma.fact_sources.upsert({
      where: { fact_id_source_item_id: { fact_id: factId, source_item_id: sourceItemId } },
      create: {
        org_id: orgId,
        fact_id: factId,
        source_item_id: sourceItemId,
        snippet,
        extracted_at: now,
      },
      update: { snippet, extracted_at: now },
    });
  };

  const insertFact = async (): Promise<string> => {
    const data = await prisma.facts.create({
      data: {
        org_id: orgId,
        owner_user_id: ownerUserId,
        subject_entity_id: subjectId,
        predicate: fact.predicate,
        cardinality: fact.cardinality ?? "one",
        claim_key: key,
        confidence: fact.confidence ?? 1.0,
        valid_from: now,
        source_item_id: sourceItemId,
        ...cols,
        // Prisma's @db.Date needs a real Date — a bare "YYYY-MM-DD" string
        // throws at runtime. Unparseable LLM dates degrade to null.
        value_date: cols.value_date ? (dateOnly(cols.value_date) ? new Date(cols.value_date) : null) : null,
      },
      select: { id: true },
    });
    return data.id;
  };

  if (!current) {
    await addSource(await insertFact());
    return "new";
  }

  // A current fact exists for this slot. Same value → re-observation (dedup).
  const sameValue =
    (current.value_text ?? null) === cols.value_text &&
    (current.value_num == null ? null : Number(current.value_num)) === cols.value_num &&
    dateOnly(current.value_date) === dateOnly(cols.value_date) &&
    (current.object_entity_id ?? null) === cols.object_entity_id;

  if (sameValue) {
    await addSource(current.id);
    return "deduped";
  }

  // TEMPLATE BLOCK: an all-null current fact is a PLACEHOLDER slot
  // (ensureTemplateSlots) — the first real value FILLS it silently. No
  // conflict review: null → value is completion, not contradiction.
  const placeholder =
    current.value_text == null &&
    current.value_num == null &&
    dateOnly(current.value_date) == null &&
    current.object_entity_id == null;

  // Different value on a single-valued slot → contradiction: supersede, don't
  // delete. (Multi-valued facts never reach here — their value is in the key.)
  // Retire the old fact FIRST so it leaves the `valid_to IS NULL` partial unique
  // index before the new current fact claims the same claim_key.
  await prisma.facts.update({ where: { id: current.id }, data: { valid_to: now } });
  const newId = await insertFact();
  await prisma.facts.update({ where: { id: current.id }, data: { superseded_by: newId } });
  await addSource(newId);
  if (placeholder) return "new"; // a filled slot is new knowledge, not a change
  // Surface the conflict for the user to validate (auto-applied but reviewable).
  await createConflictReview(orgId, ownerUserId, {
    oldId: current.id,
    newId,
    subjectId,
    predicate: fact.predicate,
  });
  return "superseded";
}

// --- Orchestration -----------------------------------------------------------

/**
 * Fold one message's extraction into the canonical store: resolve every entity,
 * then upsert every fact. This is the entry point the extraction pipeline calls.
 */
/** The canonical text an entity is embedded from — ONE definition, shared by
 *  ingest and the re-embed job so a re-embedded vector lands in exactly the
 *  same place a fresh one would. */
/**
 * GraphRAG step 1, semantic leg: entities NEAR the query vector — the seeds
 * text linking can't catch ("the design agency" → Brightwave). Same rules as
 * resolution's ANN blocking: current embedding space only, recall not truth
 * (seeds only anchor a traversal; nothing merges). Fail-soft: [] on any error.
 */
export async function annLinkEntities(
  orgId: string,
  vector: number[],
  opts: { limit?: number; minSim?: number } = {},
): Promise<string[]> {
  const limit = opts.limit ?? 4;
  const minSim = opts.minSim ?? 0.35;
  try {
    const vec = toVectorLiteral(vector);
    const rows = await prisma.$queryRaw<{ id: string; sim: number }[]>`
      SELECT id, (1 - (embedding <=> ${vec}::vector))::real AS sim
        FROM entities
       WHERE org_id = ${orgId}::uuid AND merged_into IS NULL
         AND embedding IS NOT NULL AND embedding_model = ${embeddingsModel()}
       ORDER BY embedding <=> ${vec}::vector
       LIMIT ${limit}`;
    return rows.filter((r) => r.sim >= minSim).map((r) => r.id);
  } catch (e) {
    console.error("[knowledge] ANN query linking failed", e);
    return [];
  }
}

export function embedTextForEntity(
  kind: string,
  label: string,
  naturalKeys?: Record<string, string> | null,
): string {
  const keys = Object.values(naturalKeys ?? {});
  return `${kind}: ${label}${keys.length ? " (" + keys.join(", ") + ")" : ""}`;
}

/** TEMPLATE BLOCK (user decision 2026-07-16): a kind's template fields are a
 *  GUARANTEE, not a suggestion — every node of a templated kind carries at
 *  least those fields, null-filled when unknown (extra facts stay welcome).
 *  Tables then just read the metadata. Placeholders are all-null-value facts
 *  (confidence 0) occupying the claim slot; upsertFact fills them SILENTLY
 *  on the first real value (no fact_conflict review), and orphan detection
 *  ignores them (a null slot is not a link). Idempotent + race-safe
 *  (skipDuplicates against the current-claim unique index). */
export async function ensureTemplateSlots(
  orgId: string,
  ownerUserId: string | null,
  entities: { id: string; kind: string }[],
  kinds: { kind: string; fields: { key: string }[] }[],
): Promise<number> {
  const fieldsByKind = new Map(kinds.filter((k) => k.fields.length).map((k) => [k.kind, k.fields.map((f) => f.key)]));
  const wanted: { entityId: string; predicate: string }[] = [];
  for (const e of entities) {
    for (const key of fieldsByKind.get(e.kind) ?? []) wanted.push({ entityId: e.id, predicate: key });
  }
  if (wanted.length === 0) return 0;
  const claimKeys = wanted.map((w) => `${w.entityId}::${w.predicate}`);
  const existing = await prisma.facts.findMany({
    where: { org_id: orgId, claim_key: { in: claimKeys }, valid_to: null },
    select: { claim_key: true },
  });
  const have = new Set(existing.map((f) => f.claim_key));
  const missing = wanted.filter((w) => !have.has(`${w.entityId}::${w.predicate}`));
  if (missing.length === 0) return 0;
  const now = new Date();
  const res = await prisma.facts.createMany({
    data: missing.map((w) => ({
      org_id: orgId,
      owner_user_id: ownerUserId,
      subject_entity_id: w.entityId,
      predicate: w.predicate,
      cardinality: "one",
      claim_key: `${w.entityId}::${w.predicate}`,
      confidence: 0,
      valid_from: now,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function ingestExtraction(
  orgId: string,
  ownerUserId: string | null,
  sourceItemId: string | null,
  extraction: Extraction,
  llm?: LlmProvider,
  opts: { adjudicate?: boolean } = {},
): Promise<IngestExtractionResult> {
  const res: IngestExtractionResult = {
    entitiesResolved: 0,
    entitiesCreated: 0,
    factsNew: 0,
    factsDeduped: 0,
    factsSuperseded: 0,
  };

  // Embed every extracted entity in ONE batch call (fail-soft: null → the
  // trigram-only path). The vector powers semantic blocking now and stays on
  // the entity for search later.
  if (extraction.entities.length > 0 && !extraction.entities[0].embedding) {
    const texts = extraction.entities.map((e) => embedTextForEntity(e.kind, e.label, e.naturalKeys));
    const vectors = await embedTexts(texts);
    if (vectors) extraction.entities.forEach((e, i) => { e.embedding = vectors[i]; });
  }

  // Resolve entities first so facts can reference canonical ids.
  const idMap = new Map<string, string>();
  for (const e of extraction.entities) {
    const { id, created } = await resolveEntity(orgId, ownerUserId, e, llm, opts);
    idMap.set(e.localId, id);
    res.entitiesResolved++;
    if (created) res.entitiesCreated++;
  }
  const resolve = (localId: string): string => {
    const id = idMap.get(localId);
    if (!id) throw new Error(`fact references unknown entity localId: ${localId}`);
    return id;
  };

  for (const f of extraction.facts) {
    const subjectId = resolve(f.subjectLocalId);
    const outcome = await upsertFact(orgId, ownerUserId, subjectId, f, sourceItemId, resolve);
    if (outcome === "new") res.factsNew++;
    else if (outcome === "deduped") res.factsDeduped++;
    else res.factsSuperseded++;
  }

  // TEMPLATE BLOCK: every templated node ends the ingest with AT LEAST its
  // template fields (null-filled). Best-effort — never fails the ingest.
  try {
    const { listKinds } = await import("./kinds");
    const kinds = await listKinds(orgId, ownerUserId);
    await ensureTemplateSlots(
      orgId,
      ownerUserId,
      extraction.entities.map((e) => ({ id: idMap.get(e.localId)!, kind: e.kind })).filter((e) => e.id),
      kinds,
    );
  } catch (e) {
    console.error("[knowledge] template-slot fill failed", e);
  }

  return res;
}

// --- Read side: the knowledge layer projected for display ---------------------

interface KFact {
  id: string;
  subject_entity_id: string;
  object_entity_id: string | null;
  predicate: string;
  value_text: string | null;
  value_num: number | null;
  value_date: string | null;
  unit: string | null;
  confidence: number | null;
  valid_from: Date | string | null;
}

/** All of the user's entities + what we currently know about each, with a
 *  provenance count per fact. This is the canonical knowledge view the UI shows;
 *  tables are derived from it.
 *  AGENT LENS (P5): pass opts.agentId to see the vault as ONE agent sees it —
 *  facts filter to that agent's writes (identity stays global: entities are
 *  never split, they just show fewer facts under a lens). */
export async function listKnowledge(
  orgId: string,
  opts: { agentId?: string | null; provenance?: boolean } = {},
): Promise<KnowledgeEntityView[]> {
  const [ents, facts] = await Promise.all([
    prisma.entities.findMany({
      where: { org_id: orgId, merged_into: null },
      select: { id: true, kind: true, canonical_label: true, natural_keys: true, body_md: true, graph_pin: true },
    }),
    prisma.facts.findMany({
      where: { org_id: orgId, valid_to: null, ...(opts.agentId ? { agent_id: opts.agentId } : {}) },
      select: {
        id: true,
        subject_entity_id: true,
        object_entity_id: true,
        predicate: true,
        value_text: true,
        value_num: true,
        value_date: true,
        unit: true,
        confidence: true,
        valid_from: true,
      },
      take: 5000,
    }),
  ]);
  const entities = (ents as { id: string; kind: string; canonical_label: string; natural_keys: Record<string, string>; body_md: string | null; graph_pin: { x?: unknown; y?: unknown } | null }[] | null) ?? [];
  const factList = (facts as unknown as KFact[] | null) ?? [];
  const label = new Map(entities.map((e) => [e.id, e.canonical_label]));

  // Provenance: the actual messages behind each fact (the "where did this come
  // from?" drill-down). fact_sources → items joined in two steps rather than a
  // PostgREST embed, so we don't depend on the FK relationship being named.
  const provByFact = new Map<string, FactSourceView[]>();
  const factIds = factList.map((f) => f.id);
  // opts.provenance === false skips the two heaviest queries (every
  // fact_source + its item) — the search/GraphRAG path never renders
  // provenance, so it shouldn't pay for it. UI surfaces keep the default.
  if (opts.provenance !== false && factIds.length) {
    const fs = await prisma.fact_sources.findMany({
      where: { fact_id: { in: factIds } },
      select: { fact_id: true, snippet: true, source_item_id: true },
    });
    const fsList = (fs as { fact_id: string; snippet: string | null; source_item_id: string | null }[] | null) ?? [];
    const itemIds = [...new Set(fsList.map((s) => s.source_item_id).filter(Boolean) as string[])];
    type ItemMeta = { id: string; channel: string; sender: string | null; subject: string | null; body_preview: string | null; received_at: string | null };
    const itemById = new Map<string, ItemMeta>();
    if (itemIds.length) {
      const its = await prisma.items.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, channel: true, sender: true, subject: true, body_preview: true, received_at: true },
      });
      for (const it of ((its as unknown as ItemMeta[] | null) ?? [])) itemById.set(it.id, it);
    }
    for (const s of fsList) {
      const it = s.source_item_id ? itemById.get(s.source_item_id) : undefined;
      const view: FactSourceView = {
        channel: it?.channel ?? "unknown",
        sender: it?.sender ?? null,
        subject: it?.subject ?? null,
        preview: it?.body_preview ?? null,
        snippet: s.snippet ?? null,
        receivedAt: it?.received_at ?? null,
      };
      if (!provByFact.has(s.fact_id)) provByFact.set(s.fact_id, []);
      provByFact.get(s.fact_id)!.push(view);
    }
  }

  const edges = new Map<string, number>();
  const bySubject = new Map<string, KFact[]>();
  for (const f of factList) {
    edges.set(f.subject_entity_id, (edges.get(f.subject_entity_id) ?? 0) + 1);
    if (f.object_entity_id) edges.set(f.object_entity_id, (edges.get(f.object_entity_id) ?? 0) + 1);
    if (!bySubject.has(f.subject_entity_id)) bySubject.set(f.subject_entity_id, []);
    bySubject.get(f.subject_entity_id)!.push(f);
  }

  const fmt = (f: KFact): { value: string; ref: boolean } =>
    f.object_entity_id ? { value: label.get(f.object_entity_id) ?? "?", ref: true }
      : f.value_num != null ? { value: `${f.value_num}${f.unit ? " " + f.unit : ""}`, ref: false }
      : f.value_date ? { value: dateOnly(f.value_date) ?? String(f.value_date), ref: false }
      : { value: f.value_text ?? "—", ref: false };

  return entities
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.canonical_label,
      naturalKeys: e.natural_keys ?? {},
      bodyMd: e.body_md ?? null,
      graphPin:
        e.graph_pin && typeof e.graph_pin.x === "number" && typeof e.graph_pin.y === "number"
          ? { x: e.graph_pin.x, y: e.graph_pin.y }
          : null,
      edges: edges.get(e.id) ?? 0,
      facts: (bySubject.get(e.id) ?? []).map((f) => {
        const v = fmt(f);
        const prov = provByFact.get(f.id) ?? [];
        return {
          predicate: f.predicate,
          value: v.value,
          ref: v.ref,
          refId: f.object_entity_id ?? null,
          sources: prov.length,
          provenance: prov,
          confidence: f.confidence ?? 1,
          validFrom: f.valid_from ? new Date(f.valid_from).toISOString() : null,
        };
      }),
    }))
    .sort((a, b) => b.edges - a.edges);
}
