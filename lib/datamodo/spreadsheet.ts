import ExcelJS from "exceljs";
import type { DatasetColumn } from "./types";

// Parse an uploaded spreadsheet (.xlsx) into the shape Datamodo works with:
// a set of columns (from the header row) plus plain jsonb rows keyed by column
// key. This is the inbound counterpart to lib/datamodo/xlsx.ts (export), and
// the v1 source for sheet sync until a live Google Sheets adapter is wired.

export interface SheetSnapshot {
  columns: DatasetColumn[];
  rows: Record<string, unknown>[];
}

/** Slugify a header label into a stable column key, de-duplicated within a set. */
function keyFromLabel(label: string, used: Set<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "col";
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}_${n++}`;
  used.add(key);
  return key;
}

/** Reduce an ExcelJS cell value to a primitive we can store as jsonb. */
function cellToPrimitive(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("text" in v) return v.text;                 // hyperlink / rich text
    if ("result" in v) return v.result;             // formula result
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((r) => r.text).join("");
    }
    if ("error" in v) return null;
  }
  return String(value);
}

/** True when every non-empty value in the column parses as a finite number. */
function looksNumeric(rows: Record<string, unknown>[], key: string): boolean {
  let seen = false;
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined || v === "") continue;
    seen = true;
    if (typeof v === "number") continue;
    const n = Number(v);
    if (Number.isNaN(n)) return false;
  }
  return seen;
}

export async function parseWorkbook(buf: Buffer): Promise<SheetSnapshot> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) return { columns: [], rows: [] };

  // Header row → columns (indexed by Excel column number, which is 1-based).
  const header = ws.getRow(1);
  const used = new Set<string>();
  const keyByCol: Record<number, string> = {};
  const columns: DatasetColumn[] = [];
  const colCount = ws.columnCount;
  for (let c = 1; c <= colCount; c++) {
    const raw = cellToPrimitive(header.getCell(c).value);
    const label = String(raw ?? "").trim() || `Column ${c}`;
    const key = keyFromLabel(label, used);
    keyByCol[c] = key;
    columns.push({ key, label, type: "text" });
  }

  // Data rows.
  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const data: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = 1; c <= colCount; c++) {
      const key = keyByCol[c];
      const val = cellToPrimitive(row.getCell(c).value);
      data[key] = val ?? null;
      if (val !== null && val !== "") hasValue = true;
    }
    if (hasValue) rows.push(data);
  }

  // Light type inference so numeric columns export/compare cleanly.
  for (const col of columns) {
    if (looksNumeric(rows, col.key)) col.type = "number";
  }

  return { columns, rows };
}
