// Stub of app/dashboard/actions for shoot harnesses — no server, no DB.
// run.mjs swaps this in for the real "use server" module when bundling (the
// real one pulls Prisma/pg into the browser bundle and can't run in a file://
// page). Harnesses provide fixtures via window.__shootRows / __shootSnapshots;
// every mutation "succeeds" without doing anything.

import type { DatasetRowRecord, SnapshotFull } from "@/lib/datamodo/types";

declare global {
  interface Window {
    __shootRows?: DatasetRowRecord[];
    __shootSnapshots?: SnapshotFull[];
  }
}

const OK = { ok: true as const };

export async function getDatasetRowsAction(
  _datasetId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ ok: true; rows: DatasetRowRecord[]; total: number }> {
  const rows = window.__shootRows ?? [];
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? rows.length;
  return { ok: true, rows: rows.slice(offset, offset + limit), total: rows.length };
}

export async function getSnapshotsAction(): Promise<{ ok: true; snapshots: SnapshotFull[] }> {
  return { ok: true, snapshots: window.__shootSnapshots ?? [] };
}

export async function updateRowAction() { return OK; }
export async function addRowAction() { return OK; }
export async function deleteRowAction() { return OK; }
export async function addColumnAction() { return OK; }
export async function removeColumnAction() { return OK; }
export async function renameDatasetAction() { return OK; }
export async function deleteDatasetAction() { return OK; }
export async function restoreSnapshotAction() { return OK; }
export async function createDatasetAction() { return { ...OK, id: "stub" }; }

// Shell harness (ControlCenter) surface — agents, settings, channel links.
export async function createAgentAction() { return OK; }
export async function updateAgentAction() { return OK; }
export async function deleteAgentAction() { return OK; }
export async function updateComputeSettingsAction() { return OK; }
export async function createChannelLinkCodeAction() { return { ...OK, code: "STUB-0000" }; }
