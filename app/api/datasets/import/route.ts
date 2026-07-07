import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { createDataset, getDataset, snapshotDataset } from "@/lib/datamodo/datasets";
import { parseWorkbook } from "@/lib/datamodo/spreadsheet";
import {
  createSheetLink,
  getSheetLink,
  syncSnapshotAsProposals,
} from "@/lib/datamodo/sheets";

// Import / sync a table from an uploaded spreadsheet (.xlsx).
//
//   POST /api/datasets/import        (multipart/form-data)
//     file        — the .xlsx workbook (required)
//     datasetId   — sync INTO this existing table (proposals); omit to create new
//     name        — name for the new table (defaults to the file name)
//
// v1 source is a file upload; the sheet_links row is Google-Sheets-ready so a
// live Google adapter can later drive the same sync path.
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: Request) {
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const org = await getActiveOrg(db, user.id);
  if (!org) return json({ error: "No organization found" }, 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected a multipart upload" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "No file uploaded" }, 400);

  let snapshot;
  try {
    snapshot = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch {
    return json({ error: "Could not read that spreadsheet. Export it as .xlsx and try again." }, 400);
  }
  if (snapshot.columns.length === 0) return json({ error: "The sheet has no columns." }, 400);

  const datasetId = form.get("datasetId");

  // --- Sync into an existing table: incoming rows become reviewable proposals.
  if (typeof datasetId === "string" && datasetId) {
    const ds = await getDataset(db, datasetId);
    if (!ds) return json({ error: "Table not found" }, 404);

    const link = await getSheetLink(db, datasetId);
    let keyColumn = link?.key_column;
    if (!keyColumn) {
      // First time syncing this table: match on its first column, and remember it.
      keyColumn = ds.columns[0]?.key ?? snapshot.columns[0].key;
      await createSheetLink(db, {
        datasetId,
        orgId: org.id,
        keyColumn,
        sourceRef: file.name,
        createdBy: user.id,
      });
    }

    const { added, changed } = await syncSnapshotAsProposals(
      db,
      org.id,
      datasetId,
      snapshot.rows,
      keyColumn,
    );
    return json({ ok: true, mode: "sync", added, changed });
  }

  // --- Create a brand-new table seeded from the sheet, and link it.
  const nameField = form.get("name");
  const fallback = file.name.replace(/\.[^.]+$/, "").trim() || "Imported table";
  const name = (typeof nameField === "string" && nameField.trim()) || fallback;

  const dataset = await createDataset(db, org.id, user.id, {
    name,
    description: `Imported from ${file.name}`,
    columns: snapshot.columns,
  });

  if (snapshot.rows.length) {
    const rows = snapshot.rows.map((data) => ({
      org_id: org.id,
      dataset_id: dataset.id,
      data,
      status: "accepted" as const,
      origin: "manual",
      created_by: user.id,
    }));
    const { error } = await db.from("dataset_rows").insert(rows);
    if (error) return json({ error: error.message }, 500);
  }

  await snapshotDataset(db, dataset.id, "You", `Imported ${snapshot.rows.length} rows from ${file.name}`);
  await createSheetLink(db, {
    datasetId: dataset.id,
    orgId: org.id,
    keyColumn: snapshot.columns[0].key,
    sourceRef: file.name,
    createdBy: user.id,
  });

  return json({ ok: true, mode: "create", datasetId: dataset.id, rows: snapshot.rows.length });
}
