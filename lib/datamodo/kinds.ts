import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { columnsFromTemplate, DEFAULT_KINDS, slugify, unregisteredKinds, type KindDef, type KindField, type KindRelation } from "./ontology";
import type { Extraction } from "./knowledge";

// DB side of the ontology layer: per-org kind registry CRUD + lazy seeding.
// The pure logic (canonicalization, prompt rendering, builtins) lives in
// ontology.ts; this module only moves KindDefs in and out of Postgres.

interface KindRow {
  id: string;
  kind: string;
  label: string;
  plural: string | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  aliases: string[];
  fields: unknown;
  relations: unknown;
  builtin: boolean;
}

function toDef(r: KindRow): KindDef {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    plural: r.plural ?? undefined,
    icon: r.icon ?? undefined,
    color: r.color ?? undefined,
    description: r.description ?? undefined,
    aliases: r.aliases ?? [],
    fields: Array.isArray(r.fields) ? (r.fields as unknown as KindField[]) : [],
    relations: Array.isArray(r.relations) ? (r.relations as unknown as KindRelation[]) : [],
    builtin: r.builtin,
  };
}

/** Seed the builtin categories per org. Also BACKFILLS builtins added to
 *  DEFAULT_KINDS after an org was first seeded (e.g. `note`), so old orgs
 *  don't drift from fresh ones. Trade-off: a deliberately deleted builtin
 *  resurrects on next read — acceptable until deletions get tombstones. */
export async function ensureDefaultKinds(orgId: string, ownerUserId: string | null): Promise<void> {
  const existing = await prisma.kinds.findMany({
    where: { org_id: orgId },
    select: { id: true, kind: true, builtin: true, fields: true, relations: true },
  });
  // BACKFILL (2026-07-17): builtin templates gained DECLARED CARDINALITY
  // (author/email/phone → many, issued_by/billed_to → one). Orgs seeded
  // before that hold the old json — patch the flag onto matching keys that
  // lack it (property-add only; user customizations untouched). In-memory
  // compare on every read, an UPDATE only the one time something is missing.
  for (const row of existing) {
    if (!row.builtin) continue;
    const def = DEFAULT_KINDS.find((k) => k.kind === row.kind);
    if (!def) continue;
    let changed = false;
    const fields = (Array.isArray(row.fields) ? (row.fields as unknown as KindField[]) : []).map((f) => {
      const d = def.fields.find((x) => x.key === f.key);
      if (d?.cardinality && f.cardinality == null) {
        changed = true;
        return { ...f, cardinality: d.cardinality };
      }
      return f;
    });
    const relations = (Array.isArray(row.relations) ? (row.relations as unknown as KindRelation[]) : []).map((r) => {
      const d = def.relations.find((x) => x.predicate === r.predicate);
      if (d?.cardinality && r.cardinality == null) {
        changed = true;
        return { ...r, cardinality: d.cardinality };
      }
      return r;
    });
    if (changed) {
      await prisma.kinds.update({
        where: { id: row.id },
        data: {
          fields: fields as unknown as Prisma.InputJsonValue,
          relations: relations as unknown as Prisma.InputJsonValue,
          updated_at: new Date(),
        },
      });
    }
  }
  const have = new Set(existing.map((r) => r.kind));
  const missing = DEFAULT_KINDS.filter((k) => !have.has(k.kind));
  if (missing.length === 0) return;
  await prisma.kinds.createMany({
    data: missing.map((k) => ({
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind: k.kind,
      label: k.label,
      plural: k.plural ?? null,
      icon: k.icon ?? null,
      color: k.color ?? null,
      description: k.description ?? null,
      aliases: k.aliases,
      fields: k.fields as unknown as Prisma.InputJsonValue,
      relations: k.relations as unknown as Prisma.InputJsonValue,
      // One object: a category IS a table — it ships with its columns.
      columns: columnsFromTemplate(k) as unknown as Prisma.InputJsonValue,
      builtin: true,
    })),
    skipDuplicates: true,
  });
}

/** The org's registry, seeded on first read. Extraction + UI both call this. */
export async function listKinds(orgId: string, ownerUserId: string | null): Promise<KindDef[]> {
  await ensureDefaultKinds(orgId, ownerUserId);
  const rows = await prisma.kinds.findMany({ where: { org_id: orgId }, orderBy: { created_at: "asc" } });
  return (rows as unknown as KindRow[]).map(toDef);
}

export interface KindInput {
  kind?: string;
  label: string;
  plural?: string;
  icon?: string;
  color?: string;
  description?: string;
  aliases?: string[];
  fields?: KindField[];
  relations?: KindRelation[];
}

const sanitizeFields = (fields: KindField[] | undefined): KindField[] =>
  (fields ?? [])
    .filter((f) => f?.key && f?.label)
    .map((f) => ({
      key: slugify(f.key),
      label: f.label.trim(),
      type: (["text", "number", "date", "entity"] as const).includes(f.type) ? f.type : "text",
      unit: f.unit?.trim() || undefined,
      required: !!f.required,
      cardinality: f.cardinality === "many" ? "many" : f.cardinality === "one" ? "one" : undefined,
      aliases: (f.aliases ?? []).map(slugify).filter(Boolean),
    }));

const sanitizeRelations = (rels: KindRelation[] | undefined): KindRelation[] =>
  (rels ?? [])
    .filter((r) => r?.predicate && r?.label)
    .map((r) => ({
      predicate: slugify(r.predicate),
      label: r.label.trim(),
      targetKind: r.targetKind ? slugify(r.targetKind) : undefined,
      cardinality: r.cardinality === "many" ? "many" : r.cardinality === "one" ? "one" : undefined,
      aliases: (r.aliases ?? []).map(slugify).filter(Boolean),
    }));

export async function createKind(orgId: string, ownerUserId: string | null, input: KindInput): Promise<KindDef> {
  const kind = slugify(input.kind || input.label);
  if (!kind) throw new Error("Category needs a name.");
  const label = input.label.trim();
  const fields = sanitizeFields(input.fields);
  const relations = sanitizeRelations(input.relations);
  const row = await prisma.kinds.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind,
      label,
      plural: input.plural?.trim() || null,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      description: input.description?.trim() || null,
      aliases: (input.aliases ?? []).map(slugify).filter(Boolean),
      fields: fields as unknown as Prisma.InputJsonValue,
      relations: relations as unknown as Prisma.InputJsonValue,
      // One object: the category ships as a table from birth.
      columns: columnsFromTemplate({ label, fields, relations }) as unknown as Prisma.InputJsonValue,
      builtin: false,
    },
  });
  return toDef(row as unknown as KindRow);
}

export async function updateKind(orgId: string, id: string, input: KindInput): Promise<KindDef> {
  // The slug is identity (entities.kind references it) — label/template are
  // editable, the slug itself is not (rename = create + migrate, later).
  const label = input.label.trim();
  const fields = sanitizeFields(input.fields);
  const relations = sanitizeRelations(input.relations);
  const row = await prisma.kinds.update({
    where: { id, org_id: orgId },
    data: {
      label,
      plural: input.plural?.trim() || null,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      description: input.description?.trim() || null,
      aliases: (input.aliases ?? []).map(slugify).filter(Boolean),
      fields: fields as unknown as Prisma.InputJsonValue,
      relations: relations as unknown as Prisma.InputJsonValue,
      // Template edits regenerate the table columns (template is the truth;
      // column-side edits sync back via datasets.setColumns).
      columns: columnsFromTemplate({ label, fields, relations }) as unknown as Prisma.InputJsonValue,
      updated_at: new Date(),
    },
  });
  return toDef(row as unknown as KindRow);
}

export async function deleteKind(orgId: string, id: string): Promise<void> {
  // One object: deleting the category deletes its TABLE too (rows, snapshots
  // and relations cascade). Entities of this kind keep their kind string.
  await prisma.kinds.delete({ where: { id, org_id: orgId } });
}

// --- AI-drafted templates ------------------------------------------------------

const SUGGEST_SYSTEM = `You design a TEMPLATE for a knowledge category in a personal data assistant. The user names a category of thing they care about (e.g. "Property", "Candidate", "Shipment"); you propose what the assistant should capture about each one.

Rules:
- fields: 3-7 attributes worth tracking. snake_case keys, human labels, type one of text|number|date. Add unit for money/quantities (e.g. "USD"). Mark at most 2 as required — only what DEFINES the thing. Mark list-like attributes (authors, tags, several emails) with "cardinality":"many"; omit cardinality for ordinary single-valued attributes.
- relations: 1-4 verbs linking it to other things (snake_case predicate, human label, optional targetKind like person/company/document). Relations accumulate by default; mark a genuinely exclusive link (one issuer, one owner) with "cardinality":"one".
- aliases: 2-5 other names the category might be called (lowercase).
- icon: ONE fitting emoji. plural: the plural label. description: one plain sentence saying what belongs in this category.

Respond with ONLY JSON:
{"icon":"…","plural":"…","description":"…","aliases":["…"],"fields":[{"key":"…","label":"…","type":"text|number|date","unit":"…?","required":false,"cardinality":"many?","aliases":["…"]}],"relations":[{"predicate":"…","label":"…","targetKind":"…?","cardinality":"one?","aliases":["…"]}]}`;

export interface SuggestedTemplate {
  icon?: string;
  plural?: string;
  description?: string;
  aliases: string[];
  fields: KindField[];
  relations: KindRelation[];
}

// --- Growth loop ⑤: no-fit entities → a proposed category in Review -------------

/** Propose once this many entities of an unknown kind exist — one message
 *  isn't a pattern, three sightings are. */
export const PROPOSE_KIND_AT = 3;

/**
 * Check an extraction for kinds the registry doesn't know and, once an unknown
 * kind has accumulated PROPOSE_KIND_AT entities org-wide, file ONE
 * `category_proposal` review carrying an AI-drafted template (accept = create
 * the category). A kind is only ever proposed once — whatever the user decided
 * stands. Best-effort by design: callers swallow errors; a failed draft still
 * files the proposal with an empty template.
 */
export async function maybeProposeCategories(
  orgId: string,
  ownerUserId: string | null,
  extraction: Extraction,
  kinds: KindDef[],
): Promise<void> {
  const candidates = unregisteredKinds(extraction, kinds);
  if (candidates.length === 0) return;
  // USER CONTEXT for the draft (user call 2026-07-16: the pipeline takes the
  // initiative on templates — so the draft should reflect THIS user's world,
  // not a generic guess). Loaded once; every leg fail-soft.
  const businessContext = ownerUserId
    ? await import("./settings")
        .then(({ getOnboardingContext }) => getOnboardingContext(ownerUserId))
        .then((c) => c.businessContext)
        .catch(() => null)
    : null;
  const agents = await prisma.agents
    .findMany({
      where: { org_id: orgId, status: "active", NOT: { purpose_text: null } },
      select: { name: true, purpose_text: true },
      take: 6,
    })
    .then((rows) => rows.map((a) => `${a.name}: ${(a.purpose_text ?? "").slice(0, 120)}`))
    .catch(() => [] as string[]);
  for (const cand of candidates) {
    const count = await prisma.entities.count({
      where: { org_id: orgId, kind: cand.kind, merged_into: null },
    });
    if (count < PROPOSE_KIND_AT) continue;
    const prior = await prisma.knowledge_reviews.findFirst({
      where: { org_id: orgId, kind: "category_proposal", detail: { path: ["proposedKind"], equals: cand.kind } },
      select: { id: true },
    });
    if (prior) continue;
    const sampleRows = await prisma.entities.findMany({
      where: { org_id: orgId, kind: cand.kind, merged_into: null },
      select: { canonical_label: true },
      orderBy: { support: "desc" },
      take: 5,
    });
    const samples = sampleRows.map((r) => r.canonical_label);
    // The strongest field signal: predicates ALREADY observed on these
    // entities — the draft should formalize what extraction is finding, so
    // template slots line up with real metadata (→ uniform tables).
    const observed = await prisma.$queryRaw<{ predicate: string; n: bigint }[]>`
      SELECT f.predicate, count(*) AS n
        FROM facts f JOIN entities e ON e.id = f.subject_entity_id
       WHERE e.org_id = ${orgId}::uuid AND e.kind = ${cand.kind} AND e.merged_into IS NULL
         AND f.valid_to IS NULL AND f.object_entity_id IS NULL
         AND (f.value_text IS NOT NULL OR f.value_num IS NOT NULL OR f.value_date IS NOT NULL)
       GROUP BY f.predicate ORDER BY n DESC LIMIT 8`.catch(() => []);
    // The relations the graph has ALREADY drawn from these entities: their
    // edges, grouped by predicate + target kind (user call 2026-07-16:
    // "its relationship to other templates should be inferred out of its
    // edges"). These merge into the draft deterministically below — they are
    // observations, not guesses.
    const observedRels = await prisma.$queryRaw<{ predicate: string; target_kind: string; n: bigint }[]>`
      SELECT f.predicate, o.kind AS target_kind, count(*) AS n
        FROM facts f
        JOIN entities e ON e.id = f.subject_entity_id
        JOIN entities o ON o.id = f.object_entity_id
       WHERE e.org_id = ${orgId}::uuid AND e.kind = ${cand.kind} AND e.merged_into IS NULL
         AND f.valid_to IS NULL
       GROUP BY f.predicate, o.kind ORDER BY n DESC LIMIT 6`.catch(() => []);
    const label = cand.kind.replace(/_/g, " ").replace(/(^|\s)\w/g, (m) => m.toUpperCase());
    const hint = [
      `Seen in the user's messages as: ${samples.join(", ")}.`,
      observed.length
        ? `Facts already observed on them (prefer fields matching these): ${observed.map((o) => `${o.predicate} (${o.n}×)`).join(", ")}.`
        : null,
      observedRels.length
        ? `Edges already drawn from them (keep these relations): ${observedRels.map((r) => `${r.predicate}→${r.target_kind} (${r.n}×)`).join(", ")}.`
        : null,
      businessContext ? `About the user's work: ${businessContext}` : null,
      agents.length ? `The user's agents (what they collect): ${agents.join(" · ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    let template: SuggestedTemplate = { aliases: [], fields: [], relations: [] };
    try {
      template = await suggestKindTemplate(ownerUserId, label, hint);
    } catch (e) {
      console.error(`[kinds] template draft failed for proposal "${cand.kind}"`, e);
    }
    // Graph-observed relations ALWAYS make the template (deterministic merge
    // after the draft — the model may phrase them, never drop them).
    for (const r of observedRels) {
      if (template.relations.some((t) => t.predicate === r.predicate)) continue;
      if (template.relations.length >= 6) break;
      template.relations.push({
        predicate: r.predicate,
        label: r.predicate.replace(/_/g, " "),
        targetKind: r.target_kind,
      });
    }
    await prisma.knowledge_reviews.create({
      data: {
        org_id: orgId,
        owner_user_id: ownerUserId,
        kind: "category_proposal",
        status: "pending",
        confidence: null,
        impact: count,
        detail: { proposedKind: cand.kind, label, count, sampleLabels: samples, template } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

/** Draft a category template from a name (+ optional hint) so the user prunes
 *  chips instead of hand-writing schema. Runs on the owner's LLM (BYOK-aware). */
export async function suggestKindTemplate(
  ownerUserId: string | null,
  name: string,
  hint?: string | null,
): Promise<SuggestedTemplate> {
  const { llmForUser } = await import("./llm-for-user");
  const llm = await llmForUser(ownerUserId);
  const r = await llm.chatJSON<SuggestedTemplate>({
    model: llm.models.extract,
    system: SUGGEST_SYSTEM,
    user: `Category: ${name}${hint ? `\nAbout the user's use of it: ${hint}` : ""}`,
    maxTokens: 4096,
    temperature: 0,
  });
  return {
    icon: typeof r.icon === "string" ? r.icon.slice(0, 4) : undefined,
    plural: typeof r.plural === "string" ? r.plural.slice(0, 60) : undefined,
    description: typeof r.description === "string" ? r.description.slice(0, 300) : undefined,
    aliases: (Array.isArray(r.aliases) ? r.aliases : []).map(slugify).filter(Boolean).slice(0, 6),
    fields: sanitizeFields(Array.isArray(r.fields) ? r.fields : []).slice(0, 8),
    relations: sanitizeRelations(Array.isArray(r.relations) ? r.relations : []).slice(0, 5),
  };
}
