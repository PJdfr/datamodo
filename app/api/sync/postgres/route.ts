import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listDatasetRows } from "@/lib/datamodo/datasets";
import { postgresWriter } from "@/lib/datamodo/sync-outbound";
import type { DatasetColumn } from "@/lib/datamodo/types";

// Outbound sync (phase 1): push one dataset's accepted rows to the user's own
// Postgres, idempotently (upsert by the datamodo row id). The connection
// string is used for this request only and never stored — a re-sync re-enters
// it. Org-scoped: only the caller's own datasets are readable.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ROWS = 5000;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no workspace" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { datasetId?: string; connectionString?: string; table?: string }
    | null;
  const datasetId = body?.datasetId?.trim();
  const connectionString = body?.connectionString?.trim();
  if (!datasetId || !connectionString) {
    return NextResponse.json({ error: "datasetId and connectionString are required" }, { status: 400 });
  }
  if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
    return NextResponse.json({ error: "That doesn't look like a postgres:// connection string." }, { status: 400 });
  }

  // Ownership + shape: the dataset must belong to the caller's org.
  const ds = await prisma.datasets.findFirst({
    where: { id: datasetId, org_id: org.id },
    select: { id: true, name: true, columns: true },
  });
  if (!ds) return NextResponse.json({ error: "table not found" }, { status: 404 });
  const columns = (Array.isArray(ds.columns) ? ds.columns : []) as unknown as DatasetColumn[];
  const table = body?.table?.trim() || ds.name;

  const { rows } = await listDatasetRows(datasetId, { limit: MAX_ROWS });
  const result = await postgresWriter.push(
    { connectionString, table },
    columns,
    rows.map((r) => ({ id: r.id, data: r.data })),
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, synced: result.synced, table: result.table, total: rows.length });
}
