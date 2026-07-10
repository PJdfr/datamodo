import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { prisma } from "@/lib/prisma";
import { createDataset } from "@/lib/datamodo/datasets";
import { projectEntitiesToDataset } from "@/lib/datamodo/project";
import type { KindField, KindRelation } from "@/lib/datamodo/ontology";
import type { DatasetColumn } from "@/lib/datamodo/types";

// One-click "category → table": the template IS the schema. Creates a dataset
// whose columns mirror the category's fields + relation verbs, then projects
// every entity of that kind into it (projectEntitiesToDataset matches columns
// by key == predicate — exact by construction here, no convention gamble).
export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const row = await prisma.kinds.findFirst({ where: { id, org_id: org.id } });
  if (!row) return NextResponse.json({ error: "category not found" }, { status: 404 });
  const fields = (Array.isArray(row.fields) ? row.fields : []) as unknown as KindField[];
  const relations = (Array.isArray(row.relations) ? row.relations : []) as unknown as KindRelation[];

  const columns: DatasetColumn[] = [
    { key: "name", label: row.label, type: "text" },
    ...fields
      // Internal bookkeeping fields aren't worth a column.
      .filter((f) => !["file_type", "file_size", "indexed"].includes(f.key))
      .map((f) => ({ key: f.key, label: f.label, type: f.type === "entity" ? "text" : f.type })),
    // Relationship targets project as their label (text).
    ...relations.map((r) => ({ key: r.predicate, label: r.label, type: "text" })),
  ];

  const baseName = row.plural?.trim() || `${row.label}s`;
  let dataset;
  try {
    dataset = await createDataset(org.id, user.id, {
      name: baseName,
      description: `Built from the “${row.label}” category — refreshed by projecting the knowledge graph.`,
      columns,
    });
  } catch {
    // Name taken → project into the existing table of that name instead of
    // failing; its columns stay as the user made them.
    const existing = await prisma.datasets.findFirst({
      where: { org_id: org.id, name: { equals: baseName, mode: "insensitive" } },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "could not create the table" }, { status: 400 });
    dataset = { id: existing.id };
  }

  const result = await projectEntitiesToDataset(org.id, {
    kind: row.kind,
    datasetId: dataset.id,
    agentName: "Categories",
    labelColumn: "name",
  });
  return NextResponse.json({ datasetId: dataset.id, name: baseName, ...result });
}
