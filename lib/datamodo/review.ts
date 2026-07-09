import { prisma } from "@/lib/prisma";
import type { DatasetColumn, DiffCell, ReviewItem } from "./types";

// The read side of the versioning ("pull request") surface: every pending
// change across the whole workspace, enriched so the UI can group it (by agent /
// table / comm chunk) and render a real diff. The write side (accept/reject,
// singly or in bulk) lives in datasets.ts alongside applyProposalRow.

type RawRow = {
  id: string;
  dataset_id: string;
  data: Record<string, unknown>;
  status: string;
  human_edited: boolean;
  proposed_kind: string | null;
  target_row_id: string | null;
  proposed_by: string | null;
  batch_id: string | null;
  created_at: string;
  source_item_id: string | null;
};

/** Loose equality for cell values (numbers vs numeric strings, null vs ""). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const an = a === null || a === undefined || a === "";
  const bn = b === null || b === undefined || b === "";
  if (an && bn) return true;
  if (an !== bn) return false;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  return String(a) === String(b);
}

/** All pending changes in an org, newest first, ready for the review surface. */
export async function listPendingChanges(orgId: string): Promise<ReviewItem[]> {
  // Tables (name + columns) for labels and diff shape.
  const dsData = await prisma.datasets.findMany({
    where: { org_id: orgId },
    select: { id: true, name: true, columns: true },
  });
  const datasets = new Map(
    (dsData as { id: string; name: string; columns: unknown }[]).map((d) => [
      d.id,
      { name: d.name, columns: (Array.isArray(d.columns) ? d.columns : []) as DatasetColumn[] },
    ]),
  );

  // Every row for the org once (we need accepted targets to diff updates).
  const rowData = await prisma.dataset_rows.findMany({
    where: { org_id: orgId },
    select: {
      id: true,
      dataset_id: true,
      data: true,
      status: true,
      human_edited: true,
      proposed_kind: true,
      target_row_id: true,
      proposed_by: true,
      batch_id: true,
      created_at: true,
      source_item_id: true,
    },
    orderBy: { created_at: "desc" },
  });
  const allRows = rowData as unknown as RawRow[];

  const acceptedById = new Map<string, RawRow>();
  const proposed: RawRow[] = [];
  for (const r of allRows) {
    if (r.status === "accepted") acceptedById.set(r.id, r);
    else if (r.status === "proposed") proposed.push(r);
  }
  if (proposed.length === 0) return [];

  // Source-message labels for the "comm chunk" grouping axis.
  const sourceIds = [...new Set(proposed.filter((r) => r.source_item_id).map((r) => r.source_item_id as string))];
  const sourceLabels = new Map<string, string>();
  if (sourceIds.length) {
    const items = await prisma.items.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, subject: true, sender: true },
    });
    for (const it of items as { id: string; subject: string | null; sender: string | null }[]) {
      sourceLabels.set(it.id, it.subject?.trim() || it.sender?.trim() || "a message");
    }
  }

  return proposed.map((p) => {
    const ds = datasets.get(p.dataset_id);
    const columns = ds?.columns ?? [];
    const kind: "add" | "update" = p.proposed_kind === "update" ? "update" : "add";
    const target = p.target_row_id ? acceptedById.get(p.target_row_id) : null;
    const current = target?.data ?? null;

    const cells: DiffCell[] =
      kind === "update"
        ? columns.map((c) => {
            const before = current ? current[c.key] : undefined;
            const after = p.data ? p.data[c.key] : undefined;
            return { key: c.key, label: c.label, before, after, changed: !sameValue(before, after) };
          })
        : [];

    return {
      id: p.id,
      kind,
      datasetId: p.dataset_id,
      datasetName: ds?.name ?? "a table",
      columns,
      agent: p.proposed_by ?? "An agent",
      batchId: p.batch_id,
      sourceLabel: p.source_item_id ? sourceLabels.get(p.source_item_id) ?? null : null,
      createdAt: p.created_at,
      conflict: !!target && target.human_edited,
      data: p.data ?? {},
      cells,
    };
  });
}
