import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listDatasets } from "@/lib/datamodo/datasets";
import { datasetsToWorkbook, xlsxFilename } from "@/lib/datamodo/xlsx";

// Multi-table Excel export: one workbook, one sheet per table.
//   /api/datasets/export            → all of the user's tables
//   /api/datasets/export?ids=a,b,c  → just those tables
export const runtime = "nodejs";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request) {
  const db = createClient(await cookies());

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const org = await getActiveOrg(user.id);
  if (!org) return new Response("Not found", { status: 404 });

  const all = await listDatasets(org.id);
  const idsParam = new URL(req.url).searchParams.get("ids");
  const chosen = idsParam
    ? all.filter((d) => idsParam.split(",").filter(Boolean).includes(d.id))
    : all;

  if (chosen.length === 0) return new Response("No tables to export", { status: 404 });

  const buf = await datasetsToWorkbook(
    chosen.map((d) => ({ name: d.name, columns: d.columns, rows: d.rows })),
  );
  const filename =
    chosen.length === 1 ? xlsxFilename(chosen[0].name) : "datamodo-tables.xlsx";

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": XLSX_TYPE,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
