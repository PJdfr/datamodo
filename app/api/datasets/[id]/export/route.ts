import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listDatasets } from "@/lib/datamodo/datasets";
import { datasetsToWorkbook, xlsxFilename } from "@/lib/datamodo/xlsx";

// Reads cookies for the authed Supabase session; RLS gates dataset visibility.
export const runtime = "nodejs";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = createClient(await cookies());

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const org = await getActiveOrg(user.id);
  if (!org) return new Response("Not found", { status: 404 });

  const dataset = (await listDatasets(org.id)).find((d) => d.id === id);
  if (!dataset) return new Response("Not found", { status: 404 });

  const buf = await datasetsToWorkbook([
    { name: dataset.name, columns: dataset.columns, rows: dataset.rows },
  ]);

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": XLSX_TYPE,
      "content-disposition": `attachment; filename="${xlsxFilename(dataset.name)}"`,
      "cache-control": "no-store",
    },
  });
}
