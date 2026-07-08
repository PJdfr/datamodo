import type { SupabaseClient } from "@supabase/supabase-js";
import { getLlmProvider } from "@/lib/llm";

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
const AUTO_MERGE = 0.85;
const PROPOSE = 0.55;

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
  admin: SupabaseClient,
  orgId: string,
  ownerUserId: string | null,
  e: ExtractedEntity,
): Promise<{ id: string; created: boolean }> {
  const key = normalizeKey(e);

  // Tier 0 — deterministic exact match. Free, kills most redundancy.
  const { data: exact, error: exactErr } = await admin
    .from("entities")
    .select("id")
    .eq("org_id", orgId)
    .eq("kind", e.kind)
    .eq("normalized_key", key)
    .is("merged_into", null)
    .maybeSingle();
  if (exactErr) throw exactErr;
  if (exact) {
    await bumpSupport(admin, exact.id);
    return { id: exact.id, created: false };
  }

  // Tier 1 — blocking: only compare against the top trigram candidates for THIS
  // org, never the whole table. (Tier 1b: pgvector ANN when embeddings exist.)
  const { data: cands, error: candErr } = await admin.rpc("knowledge_match_entities", {
    p_org: orgId,
    p_kind: e.kind,
    p_label: e.label,
    p_limit: 10,
  });
  if (candErr) throw candErr;
  const candidates = (cands as MatchCandidate[] | null) ?? [];
  const top = candidates[0];

  // Strong surface-text match → resolve without an LLM call.
  if (top && top.sim >= TRGM_HIGH) {
    await bumpSupport(admin, top.id);
    return { id: top.id, created: false };
  }

  // Tier 2/3 — ambiguous: ask the model whether it's the same real-world entity,
  // with a confidence. (Only runs when blocking surfaced candidates.)
  const verdict = candidates.length
    ? await adjudicateMatch(e, candidates)
    : { matchId: null as string | null, confidence: 0, reason: "" };

  // High confidence → resolve to the canonical entity now, logged for audit.
  if (verdict.matchId && verdict.confidence >= AUTO_MERGE) {
    await bumpSupport(admin, verdict.matchId);
    await createMergeReview(admin, orgId, ownerUserId, {
      sourceId: null,
      targetId: verdict.matchId,
      confidence: verdict.confidence,
      status: "accepted",
      detail: { auto: true, parsedLabel: e.label, reason: verdict.reason },
    });
    return { id: verdict.matchId, created: false };
  }

  // Otherwise create a new entity...
  const { data: created, error: insErr } = await admin
    .from("entities")
    .insert({
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind: e.kind,
      canonical_label: e.label,
      normalized_key: key,
      natural_keys: e.naturalKeys ?? {},
      support: 1,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  // ...and, if there's a plausible-but-uncertain match, PROPOSE a merge for the
  // user to validate (never a silent merge — a wrong merge corrupts data).
  if (verdict.matchId && verdict.confidence >= PROPOSE) {
    await createMergeReview(admin, orgId, ownerUserId, {
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
}

/**
 * Decide whether a newly-parsed entity is the same real-world thing as one of
 * the blocking candidates, with a confidence. Uses the LLM (the semantic
 * tiebreak). Fails safe: any error → no match (→ new entity), never a bad merge.
 */
export async function adjudicateMatch(
  e: ExtractedEntity,
  candidates: MatchCandidate[],
): Promise<{ matchId: string | null; confidence: number; reason: string }> {
  const llm = getLlmProvider();
  const list = candidates.map((c) => `- id=${c.id} label="${c.canonical_label}"`).join("\n");
  const system =
    "You decide whether a newly-parsed entity refers to the SAME real-world thing " +
    "as one of several existing candidates. Account for abbreviations, legal suffixes " +
    "(Inc/LLC/Group/Ltd), and common name variations, but do NOT merge genuinely " +
    "different organizations that merely share a word. Respond with ONLY JSON: " +
    '{"matchId": <candidate id string or null>, "confidence": <0..1>, "reason": "<one short sentence>"}.';
  const user =
    `New entity: kind="${e.kind}", label="${e.label}"` +
    (e.naturalKeys && Object.keys(e.naturalKeys).length ? `, keys=${JSON.stringify(e.naturalKeys)}` : "") +
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
  status: "pending" | "accepted";
  detail: Record<string, unknown>;
}

/** Log/propose an entity merge, ranked by how many edges the target already has. */
async function createMergeReview(
  admin: SupabaseClient,
  orgId: string,
  ownerUserId: string | null,
  args: MergeReviewArgs,
): Promise<void> {
  const impact = await countEntityEdges(admin, orgId, args.targetId);
  await admin.from("knowledge_reviews").insert({
    org_id: orgId,
    owner_user_id: ownerUserId,
    kind: "entity_merge",
    status: args.status,
    confidence: args.confidence,
    impact,
    source_entity_id: args.sourceId,
    target_entity_id: args.targetId,
    detail: args.detail,
    resolved_at: args.status === "pending" ? null : new Date().toISOString(),
  });
}

/** How many facts reference this entity (as subject or object) — its edge count. */
async function countEntityEdges(admin: SupabaseClient, orgId: string, entityId: string): Promise<number> {
  const subj = await admin
    .from("facts").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("subject_entity_id", entityId);
  const obj = await admin
    .from("facts").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("object_entity_id", entityId);
  return (subj.count ?? 0) + (obj.count ?? 0);
}

/** Record a superseded fact as a conflict the user can review, ranked by how
 *  corroborated the old value was (more sources = more impactful a change). */
async function createConflictReview(
  admin: SupabaseClient,
  orgId: string,
  ownerUserId: string | null,
  args: { oldId: string; newId: string; subjectId: string; predicate: string },
): Promise<void> {
  const { count } = await admin
    .from("fact_sources").select("id", { count: "exact", head: true }).eq("fact_id", args.oldId);
  await admin.from("knowledge_reviews").insert({
    org_id: orgId,
    owner_user_id: ownerUserId,
    kind: "fact_conflict",
    status: "pending",
    confidence: null,
    impact: (count ?? 0) + 1,
    old_fact_id: args.oldId,
    new_fact_id: args.newId,
    detail: { predicate: args.predicate },
  });
}

/** Surface a low-confidence extraction for the user to confirm ("did we
 *  understand this message?"). High-confidence extractions file silently. */
export async function createExtractionReview(
  admin: SupabaseClient,
  orgId: string,
  ownerUserId: string | null,
  args: { itemId: string; snippet: string; confidence: number; factCount: number },
): Promise<void> {
  await admin.from("knowledge_reviews").insert({
    org_id: orgId,
    owner_user_id: ownerUserId,
    kind: "extraction",
    status: "pending",
    confidence: args.confidence,
    impact: args.factCount,
    item_id: args.itemId,
    detail: { snippet: args.snippet.slice(0, 400) },
  });
}

async function bumpSupport(admin: SupabaseClient, id: string): Promise<void> {
  // NOTE: read-modify-write; move to an atomic RPC (support = support + 1)
  // before this runs concurrently per entity.
  const { data } = await admin.from("entities").select("support").eq("id", id).single();
  const next = ((data as { support: number } | null)?.support ?? 0) + 1;
  await admin.from("entities").update({ support: next, updated_at: new Date().toISOString() }).eq("id", id);
}

/**
 * Merge duplicate entity `loserId` into `winnerId`: re-point its facts, tombstone
 * it. Intended for the async compaction pass, not the hot path.
 */
export async function mergeEntities(
  admin: SupabaseClient,
  orgId: string,
  loserId: string,
  winnerId: string,
): Promise<void> {
  await admin.from("facts").update({ subject_entity_id: winnerId }).eq("org_id", orgId).eq("subject_entity_id", loserId);
  await admin.from("facts").update({ object_entity_id: winnerId }).eq("org_id", orgId).eq("object_entity_id", loserId);
  await admin.from("entities").update({ merged_into: winnerId }).eq("id", loserId).eq("org_id", orgId);
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

/**
 * Upsert one fact into the canonical store. Single indexed lookup on claim_key —
 * no scan. Same slot+value → add provenance (dedup). Same slot, new value →
 * supersede (append-only). New slot → insert.
 */
async function upsertFact(
  admin: SupabaseClient,
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
  const now = new Date().toISOString();

  const { data: current, error: curErr } = await admin
    .from("facts")
    .select("id, value_text, value_num, value_date, object_entity_id")
    .eq("org_id", orgId)
    .eq("claim_key", key)
    .is("valid_to", null)
    .maybeSingle();
  if (curErr) throw curErr;

  const addSource = async (factId: string) => {
    await admin
      .from("fact_sources")
      .upsert(
        { org_id: orgId, fact_id: factId, source_item_id: sourceItemId, snippet: fact.snippet ?? null, extracted_at: now },
        { onConflict: "fact_id,source_item_id" },
      );
  };

  const insertFact = async (): Promise<string> => {
    const { data, error } = await admin
      .from("facts")
      .insert({
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
      })
      .select("id")
      .single();
    if (error) throw error;
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
    (current.value_date ?? null) === cols.value_date &&
    (current.object_entity_id ?? null) === cols.object_entity_id;

  if (sameValue) {
    await addSource(current.id);
    return "deduped";
  }

  // Different value on a single-valued slot → contradiction: supersede, don't
  // delete. (Multi-valued facts never reach here — their value is in the key.)
  // Retire the old fact FIRST so it leaves the `valid_to IS NULL` partial unique
  // index before the new current fact claims the same claim_key.
  await admin.from("facts").update({ valid_to: now }).eq("id", current.id);
  const newId = await insertFact();
  await admin.from("facts").update({ superseded_by: newId }).eq("id", current.id);
  await addSource(newId);
  // Surface the conflict for the user to validate (auto-applied but reviewable).
  await createConflictReview(admin, orgId, ownerUserId, {
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
export async function ingestExtraction(
  admin: SupabaseClient,
  orgId: string,
  ownerUserId: string | null,
  sourceItemId: string | null,
  extraction: Extraction,
): Promise<IngestExtractionResult> {
  const res: IngestExtractionResult = {
    entitiesResolved: 0,
    entitiesCreated: 0,
    factsNew: 0,
    factsDeduped: 0,
    factsSuperseded: 0,
  };

  // Resolve entities first so facts can reference canonical ids.
  const idMap = new Map<string, string>();
  for (const e of extraction.entities) {
    const { id, created } = await resolveEntity(admin, orgId, ownerUserId, e);
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
    const outcome = await upsertFact(admin, orgId, ownerUserId, subjectId, f, sourceItemId, resolve);
    if (outcome === "new") res.factsNew++;
    else if (outcome === "deduped") res.factsDeduped++;
    else res.factsSuperseded++;
  }

  return res;
}
