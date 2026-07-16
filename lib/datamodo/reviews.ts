import { prisma } from "@/lib/prisma";
import { ingestExtraction, mergeEntities, type Extraction } from "./knowledge";
import type {
  ReviewItem,
  ReviewEntitySide,
  ReviewFact,
  EntityAttr,
} from "./review-types";

export type { ReviewItem } from "./review-types";

// Builds the typed review view-models the UI renders (see review-types.ts) from
// the raw knowledge_reviews rows + the entities/facts/items they reference. At
// individual-user scale the org's entities/facts are small, so we pull them once
// and assemble in memory rather than issuing a query per card.

interface ReviewRow {
  id: string;
  kind: "entity_merge" | "fact_conflict" | "extraction" | "off_template" | "category_proposal" | "orphan_prune" | "field_proposal";
  status: string;
  confidence: number | null;
  impact: number;
  source_entity_id: string | null;
  target_entity_id: string | null;
  old_fact_id: string | null;
  new_fact_id: string | null;
  item_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

interface EntityLite {
  id: string;
  canonical_label: string;
  kind: string;
  natural_keys: Record<string, string>;
}
interface FactLite {
  id: string;
  subject_entity_id: string;
  object_entity_id: string | null;
  predicate: string;
  value_text: string | null;
  value_num: number | null;
  value_date: string | null;
  unit: string | null;
  confidence: number | null;
  source_item_id: string | null;
  valid_to: string | null;
}

function factValue(f: FactLite, label: (id: string) => string): { v: string; ref: boolean } {
  if (f.object_entity_id) return { v: label(f.object_entity_id), ref: true };
  if (f.value_num != null) return { v: `${f.value_num}${f.unit ? " " + f.unit : ""}`, ref: false };
  if (f.value_date) return { v: f.value_date, ref: false };
  return { v: f.value_text ?? "—", ref: false };
}

function entitySide(e: EntityLite | undefined, edges: number, parsedLabel?: string): ReviewEntitySide {
  const attrs: EntityAttr[] = [];
  for (const [k, v] of Object.entries(e?.natural_keys ?? {})) attrs.push({ k: k.replace(/_/g, " "), v: String(v) });
  attrs.push({ k: "connected", v: `${edges} fact${edges === 1 ? "" : "s"}` });
  return { label: e?.canonical_label ?? parsedLabel ?? "?", type: e?.kind ?? "thing", attrs };
}

export async function listPendingReviews(orgId: string): Promise<ReviewItem[]> {
  const data = await prisma.knowledge_reviews.findMany({
    where: { org_id: orgId, status: "pending" },
    select: {
      id: true,
      kind: true,
      status: true,
      confidence: true,
      impact: true,
      source_entity_id: true,
      target_entity_id: true,
      old_fact_id: true,
      new_fact_id: true,
      item_id: true,
      detail: true,
      created_at: true,
    },
    orderBy: [
      { impact: "desc" },
      { confidence: { sort: "desc", nulls: "last" } },
    ],
  });
  const rows: ReviewRow[] = data.map((r) => ({
    ...r,
    kind: r.kind as ReviewRow["kind"],
    detail: (r.detail as Record<string, unknown>) ?? {},
    created_at: r.created_at.toISOString(),
  }));
  if (rows.length === 0) return [];

  // Pull the org's entities + facts once (small at individual scale).
  const [ents, facts] = await Promise.all([
    prisma.entities.findMany({
      where: { org_id: orgId },
      select: { id: true, canonical_label: true, kind: true, natural_keys: true },
    }),
    prisma.facts.findMany({
      where: { org_id: orgId },
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
        source_item_id: true,
        valid_to: true,
      },
      take: 5000,
    }),
  ]);
  const entMap = new Map<string, EntityLite>(
    ents.map((e) => [e.id, { ...e, natural_keys: (e.natural_keys as Record<string, string>) ?? {} }]),
  );
  const factList: FactLite[] = facts.map((f) => ({
    id: f.id,
    subject_entity_id: f.subject_entity_id,
    object_entity_id: f.object_entity_id,
    predicate: f.predicate,
    value_text: f.value_text,
    value_num: f.value_num == null ? null : Number(f.value_num),
    value_date: f.value_date == null ? null : f.value_date.toISOString().slice(0, 10),
    unit: f.unit,
    confidence: f.confidence,
    source_item_id: f.source_item_id,
    valid_to: f.valid_to == null ? null : f.valid_to.toISOString(),
  }));
  const factMap = new Map<string, FactLite>(factList.map((f) => [f.id, f]));
  const label = (id: string) => entMap.get(id)?.canonical_label ?? "?";

  // Edge counts per entity (subject or object references).
  const edges = new Map<string, number>();
  for (const f of factList) {
    edges.set(f.subject_entity_id, (edges.get(f.subject_entity_id) ?? 0) + 1);
    if (f.object_entity_id) edges.set(f.object_entity_id, (edges.get(f.object_entity_id) ?? 0) + 1);
  }

  // Targeted lookups: conflict sources + extraction items.
  const factIds = rows.flatMap((r) => [r.old_fact_id, r.new_fact_id]).filter(Boolean) as string[];
  const itemIds = rows.map((r) => r.item_id).filter(Boolean) as string[];
  const srcCount = new Map<string, number>();
  const srcSnippet = new Map<string, string>();
  if (factIds.length) {
    const fs = await prisma.fact_sources.findMany({
      where: { fact_id: { in: factIds } },
      select: { fact_id: true, snippet: true },
    });
    for (const s of fs) {
      srcCount.set(s.fact_id, (srcCount.get(s.fact_id) ?? 0) + 1);
      if (s.snippet && !srcSnippet.has(s.fact_id)) srcSnippet.set(s.fact_id, s.snippet);
    }
  }
  const itemMap = new Map<string, { sender: string | null; channel: string | null; body_preview: string | null }>();
  if (itemIds.length) {
    const its = await prisma.items.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, sender: true, channel: true, body_preview: true },
    });
    for (const it of its) itemMap.set(it.id, { sender: it.sender, channel: it.channel, body_preview: it.body_preview });
  }

  const out: ReviewItem[] = [];
  for (const r of rows) {
    const base = { id: r.id, confidence: r.confidence, impact: r.impact, createdAt: r.created_at };
    if (r.kind === "entity_merge" && r.target_entity_id) {
      const src = r.source_entity_id ? entMap.get(r.source_entity_id) : undefined;
      const tgt = entMap.get(r.target_entity_id);
      out.push({
        ...base,
        kind: "entity_merge",
        parsed: entitySide(src, r.source_entity_id ? edges.get(r.source_entity_id) ?? 0 : 0, r.detail.parsedLabel as string),
        canonical: entitySide(tgt, edges.get(r.target_entity_id) ?? 0),
        reason: (r.detail.reason as string) || "Similar name and overlapping identifiers.",
      });
    } else if (r.kind === "fact_conflict" && r.old_fact_id && r.new_fact_id) {
      const oldF = factMap.get(r.old_fact_id);
      const newF = factMap.get(r.new_fact_id);
      out.push({
        ...base,
        kind: "fact_conflict",
        subject: newF ? label(newF.subject_entity_id) : "?",
        field: (r.detail.predicate as string) || newF?.predicate || "value",
        was: oldF ? factValue(oldF, label).v : "?",
        now: newF ? factValue(newF, label).v : "?",
        wasSource: `${srcCount.get(r.old_fact_id) ?? 1} source${(srcCount.get(r.old_fact_id) ?? 1) === 1 ? "" : "s"}`,
        nowSource: `${srcCount.get(r.new_fact_id) ?? 1} source${(srcCount.get(r.new_fact_id) ?? 1) === 1 ? "" : "s"}`,
        note: srcSnippet.get(r.new_fact_id) || "A newer message restated this value.",
      });
    } else if (r.kind === "extraction" && r.item_id) {
      const it = itemMap.get(r.item_id);
      const mine = factList.filter((f) => f.source_item_id === r.item_id && f.valid_to === null);
      const entSet = new Map<string, { label: string; type: string }>();
      const rf: ReviewFact[] = mine.map((f) => {
        const val = factValue(f, label);
        const subj = entMap.get(f.subject_entity_id);
        if (subj) entSet.set(subj.id, { label: subj.canonical_label, type: subj.kind });
        if (f.object_entity_id) { const o = entMap.get(f.object_entity_id); if (o) entSet.set(o.id, { label: o.canonical_label, type: o.kind }); }
        return { s: label(f.subject_entity_id), p: f.predicate, v: val.v, c: f.confidence ?? 1, ref: val.ref };
      });
      out.push({
        ...base,
        kind: "extraction",
        from: it?.sender ?? "a message",
        channel: it?.channel ?? "other",
        snippet: (r.detail.snippet as string) || it?.body_preview || "",
        entities: [...entSet.values()],
        facts: rf,
      });
    } else if (r.kind === "off_template") {
      // Everything the card needs was pre-rendered at filing time.
      const display = (r.detail.facts as { subject: string; predicate: string; value: string; ref?: boolean }[]) ?? [];
      out.push({
        ...base,
        kind: "off_template",
        docLabel: (r.detail.docLabel as string) || "a document",
        docKind: (r.detail.docKind as string) ?? null,
        facts: display.map((d) => ({ s: d.subject, p: d.predicate, v: d.value, c: 1, ref: Boolean(d.ref) })),
      });
    } else if (r.kind === "category_proposal") {
      // Pre-rendered at filing time (kinds.ts maybeProposeCategories).
      const t = (r.detail.template as {
        icon?: string; description?: string;
        fields?: { key: string; label: string; type: string }[];
        relations?: { predicate: string; label: string; targetKind?: string }[];
      }) ?? {};
      out.push({
        ...base,
        kind: "category_proposal",
        proposedKind: (r.detail.proposedKind as string) || "thing",
        label: (r.detail.label as string) || (r.detail.proposedKind as string) || "New category",
        count: Number(r.detail.count ?? 0),
        sampleLabels: (r.detail.sampleLabels as string[]) ?? [],
        fields: t.fields ?? [],
        relations: t.relations ?? [],
        icon: t.icon,
        description: t.description,
      });
    } else if (r.kind === "field_proposal") {
      out.push({
        ...base,
        kind: "field_proposal",
        targetKind: (r.detail.kind as string) || "thing",
        predicate: (r.detail.predicate as string) || "?",
        count: Number(r.detail.count ?? 0),
        valueType: (r.detail.valueType as "text" | "number" | "date" | "entity") || "text",
        asRelation: Boolean(r.detail.asRelation),
        unit: (r.detail.unit as string) || undefined,
        aliasOf: (r.detail.aliasOf as string) || undefined,
      });
    } else if (r.kind === "orphan_prune") {
      // Display list pre-rendered at filing time (consolidate.ts); ids stay
      // in detail.entityIds for the accept side-effect.
      const sample = (r.detail.entities as { label: string; kind: string }[]) ?? [];
      out.push({
        ...base,
        kind: "orphan_prune",
        count: Array.isArray(r.detail.entityIds) ? (r.detail.entityIds as string[]).length : sample.length,
        entities: sample.map((e) => ({ label: e.label, type: e.kind })),
      });
    }
  }
  return out;
}

/* ------------------------------ mutations -------------------------------- */

interface FullRow extends ReviewRow { org_id: string; owner_user_id: string | null }

async function loadPending(orgId: string, id: string): Promise<FullRow | null> {
  const data = await prisma.knowledge_reviews.findFirst({
    where: { org_id: orgId, id, status: "pending" },
  });
  if (!data) return null;
  return {
    ...data,
    kind: data.kind as ReviewRow["kind"],
    detail: (data.detail as Record<string, unknown>) ?? {},
    created_at: data.created_at.toISOString(),
  };
}

/** Accept: apply the merge / confirm the conflict / confirm the extraction. */
export async function acceptReview(orgId: string, id: string): Promise<void> {
  const r = await loadPending(orgId, id);
  if (!r) return;
  if (r.kind === "entity_merge" && r.source_entity_id && r.target_entity_id) {
    await mergeEntities(orgId, r.source_entity_id, r.target_entity_id);
  } else if (r.kind === "off_template" && r.detail.extraction) {
    // "Add them anyway": replay the packaged facts through the normal ingest
    // (entity resolution + dedup + provenance) — off-template stops meaning
    // dropped, it means deferred to the user.
    await ingestExtraction(orgId, r.owner_user_id, r.item_id, r.detail.extraction as unknown as Extraction);
  } else if (r.kind === "category_proposal") {
    // Accepting CREATES the category with its drafted template — the entities
    // that triggered the proposal already carry this kind, so they snap into
    // the new template the moment it exists (growth loop ⑤ closes here).
    const t = (r.detail.template as {
      icon?: string; plural?: string; description?: string; aliases?: string[];
      fields?: import("./ontology").KindField[]; relations?: import("./ontology").KindRelation[];
    }) ?? {};
    const { createKind } = await import("./kinds");
    try {
      await createKind(orgId, r.owner_user_id, {
        kind: (r.detail.proposedKind as string) || undefined,
        label: (r.detail.label as string) || (r.detail.proposedKind as string) || "New category",
        icon: t.icon,
        plural: t.plural,
        description: t.description,
        aliases: t.aliases,
        fields: t.fields,
        relations: t.relations,
      });
    } catch (e) {
      // Already created by hand since the proposal was filed → accept is a no-op.
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  } else if (r.kind === "field_proposal") {
    // Accepting GROWS the template: the off-template predicate becomes a real
    // field (or relation, when entity-valued) on the kind — the facts already
    // using it start conforming the moment it lands. Idempotent: if the user
    // added it by hand since the proposal was filed, accept is a no-op.
    const slug = (r.detail.kind as string) || "";
    const predicate = (r.detail.predicate as string) || "";
    if (slug && predicate) {
      const { listKinds, updateKind } = await import("./kinds");
      const { templateVocabulary } = await import("./ontology-health");
      const def = (await listKinds(orgId, r.owner_user_id)).find((k) => k.kind === slug);
      if (def?.id && !templateVocabulary(def).has(predicate)) {
        const label = predicate.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
        const asRelation = Boolean(r.detail.asRelation);
        const aliasOf = (r.detail.aliasOf as string) || null;
        if (aliasOf) {
          // A spelling of an existing key → alias, not a new field; every
          // future extraction canonicalizes onto the canonical key. (Facts
          // already written under the old spelling keep it — a predicate
          // migration is a separate, later step.)
          await updateKind(orgId, def.id, {
            ...def,
            fields: def.fields.map((f) =>
              f.key === aliasOf ? { ...f, aliases: [...(f.aliases ?? []), predicate] } : f,
            ),
            relations: def.relations.map((rel) =>
              rel.predicate === aliasOf ? { ...rel, aliases: [...(rel.aliases ?? []), predicate] } : rel,
            ),
          });
        } else {
          await updateKind(orgId, def.id, {
            ...def,
            fields: asRelation
              ? def.fields
              : [...def.fields, {
                  key: predicate,
                  label,
                  type: ((r.detail.valueType as string) === "number" || (r.detail.valueType as string) === "date"
                    ? (r.detail.valueType as "number" | "date")
                    : "text"),
                  unit: (r.detail.unit as string) || undefined,
                }],
            relations: asRelation
              ? [...def.relations, { predicate, label: label.toLowerCase() }]
              : def.relations,
          });
        }
      }
    }
  } else if (r.kind === "orphan_prune") {
    // Prune ONLY entities still unlinked right now — anything that gained a
    // fact, a body, or a merge since the flag was filed survives. Deleting an
    // entity with zero facts is safe: doc_chunks cascade, dataset_rows null
    // their subject, and this review keeps only ids (no entity FK).
    const ids = ((r.detail.entityIds as string[]) ?? []).filter(Boolean);
    if (ids.length) {
      // Usage guard rides via to_jsonb (fail-soft pre-migration): an entity
      // retrieval touched in the last 30 days is in use — never delete it.
      const still = await prisma.$queryRaw<{ id: string }[]>`
        SELECT e.id FROM entities e
         WHERE e.org_id = ${orgId}::uuid AND e.id = ANY(${ids}::uuid[])
           AND e.merged_into IS NULL AND e.body_md IS NULL
           AND (to_jsonb(e) ->> 'last_used_at' IS NULL
                OR (to_jsonb(e) ->> 'last_used_at')::timestamptz < now() - interval '30 days')
           AND NOT EXISTS (
             SELECT 1 FROM facts f
              WHERE f.org_id = e.org_id
                AND (f.subject_entity_id = e.id OR f.object_entity_id = e.id)
           )`;
      const prunable = still.map((s) => s.id);
      if (prunable.length) {
        await prisma.entities.deleteMany({ where: { org_id: orgId, id: { in: prunable } } });
      }
    }
  }
  // fact_conflict + extraction: already applied to the store — accept = confirm.
  await prisma.knowledge_reviews.update({
    where: { id },
    data: { status: "accepted", resolved_at: new Date() },
  });
}

/** Reject: keep entities separate / revert a conflict / retract an extraction. */
export async function rejectReview(orgId: string, id: string): Promise<void> {
  const r = await loadPending(orgId, id);
  if (!r) return;

  if (r.kind === "fact_conflict" && r.old_fact_id && r.new_fact_id) {
    const now = new Date();
    await prisma.facts.update({ where: { id: r.new_fact_id }, data: { valid_to: now } });
    await prisma.facts.update({ where: { id: r.old_fact_id }, data: { valid_to: null, superseded_by: null } });
  } else if (r.kind === "extraction" && r.item_id) {
    // Retract this message's contribution: drop its provenance, then delete any
    // fact left with no remaining source (corroborated facts survive).
    await prisma.fact_sources.deleteMany({ where: { org_id: orgId, source_item_id: r.item_id } });
    const mine = await prisma.facts.findMany({
      where: { org_id: orgId, source_item_id: r.item_id },
      select: { id: true },
    });
    const ids = mine.map((f) => f.id);
    if (ids.length) {
      const remaining = await prisma.fact_sources.findMany({
        where: { fact_id: { in: ids } },
        select: { fact_id: true },
      });
      const kept = new Set(remaining.map((s) => s.fact_id));
      const orphans = ids.filter((fid) => !kept.has(fid));
      if (orphans.length) await prisma.facts.deleteMany({ where: { id: { in: orphans } } });
    }
  }
  // entity_merge + off_template + category_proposal + orphan_prune +
  // field_proposal: nothing was applied (only proposed) — just mark rejected.
  // A rejected category proposal is never re-filed (the filing check matches
  // any status); a rejected orphan batch is never re-asked (consolidate.ts
  // excludes ids listed in ANY orphan_prune review); a rejected field
  // proposal is never re-asked for the same kind+predicate (same any-status
  // exclusion in consolidate.ts).
  await prisma.knowledge_reviews.update({
    where: { id },
    data: { status: "rejected", resolved_at: new Date() },
  });
}
