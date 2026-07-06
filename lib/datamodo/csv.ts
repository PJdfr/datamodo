import type { DatasetColumn } from "./types";

// Minimal RFC-4180 CSV serialization for dataset export.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  // Quote when the value contains a delimiter, quote, or newline.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Serialize dataset rows to CSV. Column order/labels come from the dataset
 * definition; when a dataset has no declared columns we fall back to the union
 * of keys seen across the rows so nothing is silently dropped.
 */
export function toCsv(
  columns: DatasetColumn[],
  rows: { data: Record<string, unknown> }[],
): string {
  let cols = columns;
  if (cols.length === 0) {
    const keys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.data ?? {})) keys.add(k);
    cols = [...keys].map((k) => ({ key: k, label: k, type: "text" }));
  }

  const header = cols.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((r) =>
    cols.map((c) => escapeCell(r.data?.[c.key])).join(","),
  );
  // Trailing newline keeps tools like `wc -l` and Excel happy.
  return [header, ...body].join("\r\n") + "\r\n";
}
