import { CSSProperties } from "react";
import { BadgeVariant } from "../core/Badge";

/** A cell is a plain value, or a rich descriptor object. */
export type Cell =
  | string
  | number
  | { badge: BadgeVariant; text: string }
  | { confidence: number }   // 0..1 → coral meter + %
  | { source: string };      // channel/source tag

export interface DataColumn {
  key: string;
  label: string;
  /** Render this column's cells in Geist Mono (amounts, invoice #s). */
  mono?: boolean;
  /** CSS grid track for this column (e.g. "1.4fr", "120px"). Default "1fr". */
  flex?: string;
  /** Tint the cell coral when its row is highlighted. */
  accent?: boolean;
  /** Right-align header + cells (numeric columns). */
  align?: "left" | "right";
  /** Disable sorting on just this column (default sortable when table is). */
  sortable?: boolean;
}

export interface DataRow {
  id?: string | number;
  cells: Record<string, Cell>;
  /** Freshly-extracted row: accent left-border + tint. */
  highlight?: boolean;
}

/**
 * The warm datamodo spreadsheet grid. Mono uppercase header, hairline
 * dividers, index column, "new row" highlight — plus click-to-sort headers,
 * row hover, optional checkbox selection, and rich cells (badge, confidence
 * meter, source tag).
 *
 * @dsCard directory card lives in components/data/datatable.card.html
 */
export interface DataTableProps {
  columns: DataColumn[];
  rows: DataRow[];
  /** Enable click-to-sort headers. Default true. */
  sortable?: boolean;
  /** Show a leading checkbox column with select-all. Default false. */
  selectable?: boolean;
  /** Called with the row when a row is clicked. */
  onRowClick?: (row: DataRow) => void;
  /** Initial sort, e.g. { key: "amount", dir: "desc" }. */
  defaultSort?: { key: string; dir: "asc" | "desc" } | null;
  style?: CSSProperties;
}

export function DataTable(props: DataTableProps): JSX.Element;
