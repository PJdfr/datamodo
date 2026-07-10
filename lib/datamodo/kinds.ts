import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { DEFAULT_KINDS, slugify, type KindDef, type KindField, type KindRelation } from "./ontology";

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

/** Seed the builtin categories once per org (no-op afterwards). */
export async function ensureDefaultKinds(orgId: string, ownerUserId: string | null): Promise<void> {
  const count = await prisma.kinds.count({ where: { org_id: orgId } });
  if (count > 0) return;
  await prisma.kinds.createMany({
    data: DEFAULT_KINDS.map((k) => ({
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
      aliases: (f.aliases ?? []).map(slugify).filter(Boolean),
    }));

const sanitizeRelations = (rels: KindRelation[] | undefined): KindRelation[] =>
  (rels ?? [])
    .filter((r) => r?.predicate && r?.label)
    .map((r) => ({
      predicate: slugify(r.predicate),
      label: r.label.trim(),
      targetKind: r.targetKind ? slugify(r.targetKind) : undefined,
      aliases: (r.aliases ?? []).map(slugify).filter(Boolean),
    }));

export async function createKind(orgId: string, ownerUserId: string | null, input: KindInput): Promise<KindDef> {
  const kind = slugify(input.kind || input.label);
  if (!kind) throw new Error("Category needs a name.");
  const row = await prisma.kinds.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      kind,
      label: input.label.trim(),
      plural: input.plural?.trim() || null,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      description: input.description?.trim() || null,
      aliases: (input.aliases ?? []).map(slugify).filter(Boolean),
      fields: sanitizeFields(input.fields) as unknown as Prisma.InputJsonValue,
      relations: sanitizeRelations(input.relations) as unknown as Prisma.InputJsonValue,
      builtin: false,
    },
  });
  return toDef(row as unknown as KindRow);
}

export async function updateKind(orgId: string, id: string, input: KindInput): Promise<KindDef> {
  // The slug is identity (entities.kind references it) — label/template are
  // editable, the slug itself is not (rename = create + migrate, later).
  const row = await prisma.kinds.update({
    where: { id, org_id: orgId },
    data: {
      label: input.label.trim(),
      plural: input.plural?.trim() || null,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      description: input.description?.trim() || null,
      aliases: (input.aliases ?? []).map(slugify).filter(Boolean),
      fields: sanitizeFields(input.fields) as unknown as Prisma.InputJsonValue,
      relations: sanitizeRelations(input.relations) as unknown as Prisma.InputJsonValue,
      updated_at: new Date(),
    },
  });
  return toDef(row as unknown as KindRow);
}

export async function deleteKind(orgId: string, id: string): Promise<void> {
  // Entities of this kind keep their kind string (free-form); only the
  // template goes away. Builtins can be deleted too — it's the user's ontology.
  await prisma.kinds.delete({ where: { id, org_id: orgId } });
}
