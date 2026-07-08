// SQL projection naming — the TypeScript mirror of the Postgres functions in
// 20260708140000_dataset_sql_views.sql. Each dataset is exposed as a typed view
// at org_<orgid>.<dataset_slug> for technical users who connect over Postgres.
// Keep these in exact lock-step with private.org_schema() / private.sql_slug().

/** Per-org schema name: 'org_' + uuid with hyphens stripped. */
export function orgSchema(orgId: string): string {
  return `org_${orgId.replace(/-/g, "")}`;
}

/** A safe snake_case SQL identifier — must match private.sql_slug() exactly. */
export function sqlSlug(label: string): string {
  const s = (label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(s) ? s : `t_${s}`;
}

export interface SqlLocation {
  schema: string;
  view: string;
  /** Fully-qualified, quoted reference for a SELECT. */
  qualified: string;
}

/** Where a dataset can be queried as SQL, e.g. org_ab12."trips". */
export function datasetSqlLocation(orgId: string, datasetName: string): SqlLocation {
  const schema = orgSchema(orgId);
  const view = sqlSlug(datasetName);
  return { schema, view, qualified: `${schema}.${view}` };
}
