"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { createAgent, deleteAgent, setAgentStatus, updateAgent } from "@/lib/datamodo/agents";
import {
  acceptBatch,
  acceptProposal,
  acceptProposals,
  addColumn,
  checkpoint,
  createDataset,
  deleteDataset,
  deleteRow,
  insertRow,
  listDatasetRows,
  listSnapshotsFull,
  rejectBatch,
  rejectProposal,
  rejectProposals,
  removeColumn,
  renameDataset,
  restoreSnapshot,
  setColumns,
  simulateAgentUpdate,
  updateRow,
} from "@/lib/datamodo/datasets";
import { createRelation, deleteRelation } from "@/lib/datamodo/relations";
import { regenerateInbox } from "@/lib/datamodo/inbox";
import { createChannelLinkCode } from "@/lib/datamodo/channels";
import type { IngestChannel } from "@/lib/ingest/types";
import { getSettings, updateComputeSettings, countAgents } from "@/lib/datamodo/settings";
import { planLimits, type AiProvider, type ComputeMode } from "@/lib/datamodo/plans";
import type { DatasetColumn, DatasetRowRecord, NewAgentInput, SnapshotFull } from "@/lib/datamodo/types";

// Server Actions are reachable via direct POST, so every one re-checks auth and
// resolves the org server-side — never trusting an org id from the client.

export type ActionResult = { ok: true } | { ok: false; error: string };

async function ctx() {
  const user = await getSessionUser();
  if (!user) return { user: null, org: null } as const;
  const org = await getActiveOrg(user.id);
  return { user, org } as const;
}

export async function createAgentAction(
  input: NewAgentInput,
): Promise<ActionResult> {
  try {
    const { user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    if (!input.name?.trim()) return { ok: false, error: "Give the agent a name." };

    // Plan entitlements.
    const settings = await getSettings(user.id);
    const limits = planLimits(settings.plan);
    if (limits.maxAgents !== null) {
      const count = await countAgents(user.id);
      if (count >= limits.maxAgents) {
        return { ok: false, error: `Your ${limits.label} plan allows ${limits.maxAgents} agents. Upgrade to add more.` };
      }
    }
    if (input.mode === "auto" && !limits.autoMode) {
      return { ok: false, error: `Auto mode is a Pro feature. On ${limits.label}, agents run on-ping.` };
    }

    await createAgent(org.id, user.id, input);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to create agent." };
  }
}

export async function updateComputeSettingsAction(patch: {
  computeMode?: ComputeMode;
  aiProvider?: AiProvider;
  byokKey?: string | null;
}): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await updateComputeSettings(user.id, patch);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to save settings." };
  }
}

export async function createDatasetAction(input: {
  name: string;
  description?: string | null;
  columns?: DatasetColumn[];
  agentId?: string | null;
}): Promise<ActionResult> {
  try {
    const { user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    if (!input.name?.trim()) return { ok: false, error: "Give the dataset a name." };

    await createDataset(org.id, user.id, input);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to create dataset." };
  }
}

export async function updateAgentAction(
  agentId: string,
  patch: {
    name?: string;
    purposeText?: string | null;
    channels?: string[];
    mode?: "auto" | "ping";
    status?: "active" | "paused";
    freestyle?: boolean;
  },
): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await updateAgent(agentId, patch);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to update agent." };
  }
}

// ---------------------------------------------------------------------------
// Dataset structure + rows
// ---------------------------------------------------------------------------

export async function renameDatasetAction(datasetId: string, name: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await renameDataset(datasetId, name);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to rename table." };
  }
}

export async function deleteDatasetAction(datasetId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await deleteDataset(datasetId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to delete table." };
  }
}

export async function setColumnsAction(
  datasetId: string,
  columns: DatasetColumn[],
): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await setColumns(datasetId, columns);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to update columns." };
  }
}

export async function addColumnAction(
  datasetId: string,
  column: { label: string; type: string; defaultValue?: unknown },
): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!column.label?.trim()) return { ok: false, error: "Give the column a name." };
    await checkpoint(datasetId, `Added column “${column.label.trim()}”`, () => addColumn(datasetId, column));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to add column." };
  }
}

export async function removeColumnAction(datasetId: string, key: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await checkpoint(datasetId, "Removed a column", () => removeColumn(datasetId, key));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to remove column." };
  }
}

export async function addRowAction(
  datasetId: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const { user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    await checkpoint(datasetId, "Added a row", () => insertRow(org.id, datasetId, data, { createdBy: user.id }));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to add row." };
  }
}

export async function updateRowAction(
  datasetId: string,
  rowId: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await checkpoint(datasetId, "Edited a row", () => updateRow(rowId, data));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to update row." };
  }
}

export async function deleteRowAction(datasetId: string, rowId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await checkpoint(datasetId, "Deleted a row", () => deleteRow(rowId));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to delete row." };
  }
}

// ---------------------------------------------------------------------------
// Versioning: restore + agent proposals
// ---------------------------------------------------------------------------

export type SnapshotsResult =
  | { ok: true; snapshots: SnapshotFull[] }
  | { ok: false; error: string };

export type RowsResult =
  | { ok: true; rows: DatasetRowRecord[]; total: number }
  | { ok: false; error: string };

/** Lazy-load a page of a table's live rows (the table editor fetches on open, so
 *  the dashboard never ships every row up front). */
export async function getDatasetRowsAction(
  datasetId: string,
  opts?: { limit?: number; offset?: number },
): Promise<RowsResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const { rows, total } = await listDatasetRows(datasetId, opts ?? {});
    return { ok: true, rows, total };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to load rows." };
  }
}

export async function getSnapshotsAction(datasetId: string): Promise<SnapshotsResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const snapshots = await listSnapshotsFull(datasetId);
    return { ok: true, snapshots };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to load history." };
  }
}

export async function restoreSnapshotAction(snapshotId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await restoreSnapshot(snapshotId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to restore version." };
  }
}

export async function simulateAgentUpdateAction(datasetId: string): Promise<ActionResult> {
  try {
    const { user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    await simulateAgentUpdate(org.id, datasetId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to simulate an agent update." };
  }
}

export async function acceptProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const res = await acceptProposal(proposalId);
    if (res) await checkpoint(res.datasetId, res.summary, async () => {}, res.actor);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to apply the change." };
  }
}

export async function rejectProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await rejectProposal(proposalId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to dismiss the change." };
  }
}

export async function acceptBatchAction(batchId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const res = await acceptBatch(batchId);
    if (res) await checkpoint(res.datasetId, res.summary, async () => {}, res.actor);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to accept the changes." };
  }
}

export async function rejectBatchAction(batchId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await rejectBatch(batchId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to dismiss the changes." };
  }
}

/** Accept an arbitrary set of proposals — the primitive behind every "accept"
 *  flavour on the Versioning surface (single, multi-select, group, merge-all).
 *  Snapshots each affected table once, attributed to the agent(s) involved. */
export async function acceptProposalsAction(ids: string[]): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const results = await acceptProposals(ids);
    for (const r of results) await checkpoint(r.datasetId, r.summary, async () => {}, r.actor);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to accept the changes." };
  }
}

/** Reject (discard) an arbitrary set of proposals. */
export async function rejectProposalsAction(ids: string[]): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await rejectProposals(ids);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to dismiss the changes." };
  }
}

// ---------------------------------------------------------------------------
// Table relationships (Data page graph)
// ---------------------------------------------------------------------------

export async function createRelationAction(input: {
  fromDatasetId: string;
  fromColumn: string;
  toDatasetId: string;
  toColumn: string;
  label?: string | null;
}): Promise<ActionResult> {
  try {
    const { user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    await createRelation(org.id, { ...input, createdBy: user.id });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to create relationship." };
  }
}

export async function deleteRelationAction(id: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await deleteRelation(id);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to delete relationship." };
  }
}

// ---------------------------------------------------------------------------
// Inbound email address (the agent's capture inbox)
// ---------------------------------------------------------------------------

/** Retire the current inbound address and mint a fresh one. */
export async function regenerateInboxAction(): Promise<ActionResult & { address?: string }> {
  try {
    const { user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    const address = await regenerateInbox(org.id, user.id);
    revalidatePath("/dashboard");
    return { ok: true, address };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to regenerate inbox." };
  }
}

// Messaging channels share one bot, so the user proves ownership of their sender
// identity once by sending this short code to the bot (see lib/datamodo/channels.ts).
const LINKABLE_CHANNELS: IngestChannel[] = ["whatsapp", "slack", "teams"];

export async function createChannelLinkCodeAction(
  channel: string,
): Promise<ActionResult & { code?: string; expiresAt?: string }> {
  try {
    const { user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    if (!LINKABLE_CHANNELS.includes(channel as IngestChannel)) {
      return { ok: false, error: "That channel doesn't use a link code." };
    }
    const { code, expiresAt } = await createChannelLinkCode(org.id, user.id, channel as IngestChannel);
    return { ok: true, code, expiresAt };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to create a link code." };
  }
}

export async function setAgentStatusAction(
  agentId: string,
  status: "active" | "paused",
): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await setAgentStatus(agentId, status);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to update agent." };
  }
}

export async function deleteAgentAction(agentId: string): Promise<ActionResult> {
  try {
    const { user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await deleteAgent(agentId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to delete agent." };
  }
}
