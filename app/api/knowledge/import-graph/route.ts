import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { parseWorkbook } from "@/lib/datamodo/spreadsheet";
import { getDataset, listDatasetRows } from "@/lib/datamodo/datasets";
import {
  importTableAsGraph,
  previewTableGraph,
  type InferInput,
  type InferOverrides,
} from "@/lib/datamodo/infer-graph";

// Infer a knowledge graph from a spreadsheet (or an existing table) and merge it
// into the user's graph. Multipart form:
//   file       — an .xlsx workbook (infer from it), OR
//   datasetId  — graph-ify an existing table instead
//   name       — optional table name (defaults to the file name)
//   mode       — "preview" = dry-run: return the inferred reading (per-column
//                roles, counts) and write NOTHING; omitted = merge for real
//   overrides  — JSON InferOverrides (the user's corrections from the preview:
//                entityKind, subjectColumn, per-column role/kind/skip)
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function parseOverrides(raw: FormDataEntryValue | null): InferOverrides | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const o = JSON.parse(raw) as InferOverrides;
    // Defensive shape-trim: only the fields the inference understands.
    const columns: InferOverrides["columns"] = {};
    for (const [k, v] of Object.entries(o.columns ?? {})) {
      if (v && ["reference", "attribute", "skip"].includes(v.role)) {
        columns[k] = { role: v.role, ...(typeof v.kind === "string" && v.kind.trim() ? { kind: v.kind } : {}) };
      }
    }
    return {
      ...(typeof o.entityKind === "string" && o.entityKind.trim() ? { entityKind: o.entityKind } : {}),
      ...(typeof o.subjectColumn === "string" && o.subjectColumn ? { subjectColumn: o.subjectColumn } : {}),
      ...(Object.keys(columns).length ? { columns } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const org = await getActiveOrg(user.id);
  if (!org) return json({ error: "No organization found" }, 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected a multipart upload" }, 400);
  }

  let input: InferInput;
  const file = form.get("file");
  const datasetId = form.get("datasetId");

  if (file instanceof File) {
    let snapshot;
    try {
      snapshot = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
    } catch {
      return json({ error: "Could not read that spreadsheet. Export it as .xlsx and try again." }, 400);
    }
    if (snapshot.columns.length === 0) return json({ error: "The sheet has no columns." }, 400);
    const rawName = (form.get("name") as string | null) || file.name.replace(/\.(xlsx|xls|csv)$/i, "");
    input = { tableName: rawName || "Imported", columns: snapshot.columns, rows: snapshot.rows };
  } else if (typeof datasetId === "string" && datasetId) {
    const ds = await getDataset(datasetId);
    if (!ds || ds.org_id !== org.id) return json({ error: "Table not found" }, 404);
    const { rows } = await listDatasetRows(datasetId, { limit: 5000 });
    input = { tableName: ds.name, columns: ds.columns, rows: rows.map((r) => r.data) };
  } else {
    return json({ error: "Upload a file or pass a datasetId." }, 400);
  }

  if (input.rows.length === 0) return json({ error: "That table has no rows to import." }, 400);

  const overrides = parseOverrides(form.get("overrides"));
  try {
    if (form.get("mode") === "preview") {
      const preview = await previewTableGraph(org.id, input, overrides);
      return json({ ok: true, preview });
    }
    const result = await importTableAsGraph(org.id, user.id, input, overrides);
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Import failed." }, 500);
  }
}
