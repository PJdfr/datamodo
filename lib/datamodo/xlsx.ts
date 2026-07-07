import ExcelJS from "exceljs";
import type { DatasetColumn } from "./types";

// Excel (.xlsx) generation for dataset export. One worksheet per dataset, so a
// multi-table export is a single workbook with a sheet per table. We only ever
// export Excel — never CSV.

export interface ExportDataset {
  name: string;
  columns: DatasetColumn[];
  rows: { data: Record<string, unknown> }[];
}

// Worksheet names: max 31 chars, none of : \ / ? * [ ], and unique per workbook.
function safeSheetName(name: string, used: Set<string>): string {
  const base = (name || "Sheet").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// Coerce a stored jsonb value to the best Excel cell value for its column type.
function cellValue(type: string, value: unknown): string | number | Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isNaN(n) ? String(value) : n;
  }
  if (type === "date") {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d;
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export async function datasetsToWorkbook(datasets: ExportDataset[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Datamodo";
  wb.created = new Date();

  const used = new Set<string>();
  for (const ds of datasets) {
    // Fall back to the union of row keys when a table has no declared columns.
    let cols = ds.columns;
    if (cols.length === 0) {
      const keys = new Set<string>();
      for (const r of ds.rows) for (const k of Object.keys(r.data ?? {})) keys.add(k);
      cols = [...keys].map((k) => ({ key: k, label: k, type: "text" }));
    }

    const ws = wb.addWorksheet(safeSheetName(ds.name, used));
    ws.columns = cols.map((c) => ({
      header: c.label,
      key: c.key,
      width: Math.min(40, Math.max(12, c.label.length + 4)),
    }));
    for (const r of ds.rows) {
      const record: Record<string, string | number | Date | null> = {};
      for (const c of cols) record[c.key] = cellValue(c.type, r.data?.[c.key]);
      ws.addRow(record);
    }
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  // Always produce at least one (empty) sheet so the file is valid.
  if (wb.worksheets.length === 0) wb.addWorksheet("Empty");

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function xlsxFilename(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "export"}.xlsx`;
}
