import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getDataset, listAcceptedRows } from "@/lib/datamodo/datasets";
import { toCsv } from "@/lib/datamodo/csv";

// Reads cookies for the authed Supabase session; RLS gates dataset visibility.
export const runtime = "nodejs";

function filenameFor(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "dataset"}.csv`;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = createClient(await cookies());

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dataset = await getDataset(db, id);
  if (!dataset) {
    // Either it doesn't exist or RLS hid it — same response either way.
    return new Response("Not found", { status: 404 });
  }

  const rows = await listAcceptedRows(db, id);
  const csv = toCsv(dataset.columns, rows);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filenameFor(dataset.name)}"`,
      "cache-control": "no-store",
    },
  });
}
