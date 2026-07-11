import { prisma } from "@/lib/prisma";
import {
  COMBINE_BATCH_ROWS,
  combineExtractions,
  inferGraphFromTable,
  type InferInput,
  type InferOverrides,
  type InferredSchema,
} from "./infer-graph-core";

// DB shell around the pure inference core (infer-graph-core.ts, import-free so
// node:test can load it): known-label loading, the dry-run preview, and the
// batched merge into the knowledge layer.

export * from "./infer-graph-core";

// ---- preview + import -------------------------------------------------------

async function orgKnownLabels(orgId: string): Promise<Set<string>> {
  // Existing entity labels feed reference detection (a column of known entities
  // is a relationship, even without a telltale name).
  const data = await prisma.entities.findMany({
    where: { org_id: orgId, merged_into: null },
    select: { canonical_label: true },
  });
  return new Set(data.map((e) => e.canonical_label.trim().toLowerCase()));
}

export interface ImportGraphPreview {
  schema: InferredSchema;
  rowCount: number;
  factCount: number;
  /** A few row identities, original casing. */
  subjectSamples: string[];
  /** Referenced values that already exist in the graph vs would be created. */
  knownReferenced: number;
  newReferenced: number;
  /** Every column with the role the CURRENT reading assigns it. */
  columns: { key: string; label: string; type: string; role: "subject" | "reference" | "attribute" | "skip"; refKind: string | null }[];
}

/** Dry-run the inference for the confirm step: what we'd read, per column,
 *  and how it would land — NOTHING is written. */
export async function previewTableGraph(
  orgId: string,
  input: InferInput,
  overrides?: InferOverrides,
): Promise<ImportGraphPreview> {
  const knownLabels = await orgKnownLabels(orgId);
  const inferred = inferGraphFromTable(input, { knownLabels, overrides });
  const { schema } = inferred;

  const refByCol = new Map(schema.references.map((r) => [r.column, r]));
  const attrCols = new Set(schema.attributes.map((a) => a.column));
  const skipped = new Set(schema.skipped);
  const columns = input.columns.map((c) => ({
    key: c.key,
    label: c.label,
    type: c.type,
    role:
      c.key === schema.subjectColumn
        ? ("subject" as const)
        : refByCol.has(c.key)
        ? ("reference" as const)
        : attrCols.has(c.key)
        ? ("attribute" as const)
        : skipped.has(c.key)
        ? ("skip" as const)
        : ("attribute" as const),
    refKind: refByCol.get(c.key)?.kind ?? null,
  }));

  let knownReferenced = 0;
  for (const l of inferred.referencedLabels) if (knownLabels.has(l)) knownReferenced++;
  return {
    schema,
    rowCount: inferred.extractions.length,
    factCount: inferred.factCount,
    subjectSamples: inferred.extractions.slice(0, 5).map((e) => e.entities[0].label),
    knownReferenced,
    newReferenced: inferred.referencedLabels.length - knownReferenced,
    columns,
  };
}

export interface ImportGraphResult {
  schema: InferredSchema;
  rowsProcessed: number;
  entitiesCreated: number;
  entitiesResolved: number;
  factsNew: number;
  factsDeduped: number;
}

/** Infer a graph from a table and merge every row into the existing knowledge
 *  graph via `ingestExtraction` (resolution + dedup + bitemporal). Rows ingest
 *  in COMBINED batches so a reference repeated across rows resolves once. */
export async function importTableAsGraph(
  orgId: string,
  ownerUserId: string | null,
  input: InferInput,
  overrides?: InferOverrides,
): Promise<ImportGraphResult> {
  const knownLabels = await orgKnownLabels(orgId);
  const inferred = inferGraphFromTable(input, { knownLabels, overrides });

  // Lazy import so the pure inference above stays free of knowledge.ts's runtime deps.
  const { ingestExtraction } = await import("./knowledge");
  const { llmForUser } = await import("./llm-for-user");
  // Entity adjudication during the merge runs on the user's own key when set.
  const llm = await llmForUser(ownerUserId);
  const totals = { entitiesCreated: 0, entitiesResolved: 0, factsNew: 0, factsDeduped: 0 };
  for (let at = 0; at < inferred.extractions.length; at += COMBINE_BATCH_ROWS) {
    const batch = combineExtractions(inferred.extractions.slice(at, at + COMBINE_BATCH_ROWS));
    const r = await ingestExtraction(orgId, ownerUserId, null, batch, llm);
    totals.entitiesCreated += r.entitiesCreated;
    totals.entitiesResolved += r.entitiesResolved;
    totals.factsNew += r.factsNew;
    totals.factsDeduped += r.factsDeduped;
  }
  return { schema: inferred.schema, rowsProcessed: inferred.extractions.length, ...totals };
}
