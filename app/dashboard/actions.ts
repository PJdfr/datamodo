"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
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
import { allChannelInfo, channelInfo, isChannelId, type ChannelId } from "@/lib/channels/config";
import { mintLinkCode, linkedHandle } from "@/lib/channels/link";
import { dereferenceItems } from "@/lib/ingest/retention";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSettings, updateComputeSettings, countAgents } from "@/lib/datamodo/settings";
import { planLimits, type AiProvider, type ComputeMode } from "@/lib/datamodo/plans";
import type { DatasetColumn, DatasetRowRecord, NewAgentInput, SnapshotFull } from "@/lib/datamodo/types";

// Server Actions are reachable via direct POST, so every one re-checks auth and
// resolves the org server-side — never trusting an org id from the client.

export type ActionResult = { ok: true } | { ok: false; error: string };

async function ctx() {
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { db, user: null, org: null } as const;
  const org = await getActiveOrg(db, user.id);
  return { db, user, org } as const;
}

export async function createAgentAction(
  input: NewAgentInput,
): Promise<ActionResult> {
  try {
    const { db, user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    if (!input.name?.trim()) return { ok: false, error: "Give the agent a name." };

    // Plan entitlements.
    const settings = await getSettings(db, user.id);
    const limits = planLimits(settings.plan);
    if (limits.maxAgents !== null) {
      const count = await countAgents(db, user.id);
      if (count >= limits.maxAgents) {
        return { ok: false, error: `Your ${limits.label} plan allows ${limits.maxAgents} agents. Upgrade to add more.` };
      }
    }
    if (input.mode === "auto" && !limits.autoMode) {
      return { ok: false, error: `Auto mode is a Pro feature. On ${limits.label}, agents run on-ping.` };
    }

    await createAgent(db, org.id, user.id, input);
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await updateComputeSettings(db, user.id, patch);
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
    const { db, user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    if (!input.name?.trim()) return { ok: false, error: "Give the dataset a name." };

    await createDataset(db, org.id, user.id, input);
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await updateAgent(db, agentId, patch);
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await renameDataset(db, datasetId, name);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to rename table." };
  }
}

export async function deleteDatasetAction(datasetId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await deleteDataset(db, datasetId);
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await setColumns(db, datasetId, columns);
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!column.label?.trim()) return { ok: false, error: "Give the column a name." };
    await checkpoint(db, datasetId, `Added column “${column.label.trim()}”`, () => addColumn(db, datasetId, column));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to add column." };
  }
}

export async function removeColumnAction(datasetId: string, key: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await checkpoint(db, datasetId, "Removed a column", () => removeColumn(db, datasetId, key));
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
    const { db, user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    await checkpoint(db, datasetId, "Added a row", () => insertRow(db, org.id, datasetId, data, { createdBy: user.id }));
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await checkpoint(db, datasetId, "Edited a row", () => updateRow(db, rowId, data));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to update row." };
  }
}

export async function deleteRowAction(datasetId: string, rowId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await checkpoint(db, datasetId, "Deleted a row", () => deleteRow(db, rowId));
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const { rows, total } = await listDatasetRows(db, datasetId, opts ?? {});
    return { ok: true, rows, total };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to load rows." };
  }
}

export async function getSnapshotsAction(datasetId: string): Promise<SnapshotsResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const snapshots = await listSnapshotsFull(db, datasetId);
    return { ok: true, snapshots };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to load history." };
  }
}

export async function restoreSnapshotAction(snapshotId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await restoreSnapshot(db, snapshotId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to restore version." };
  }
}

export async function simulateAgentUpdateAction(datasetId: string): Promise<ActionResult> {
  try {
    const { db, user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    await simulateAgentUpdate(db, org.id, datasetId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to simulate an agent update." };
  }
}

/** The distinct source-message ids behind a set of proposals — captured BEFORE
 *  resolving them, so we can run the retention sweep (drop merged messages down
 *  to a reference where re-fetchable) once they're accepted/rejected. */
async function sourceItemsFor(
  db: SupabaseClient,
  filter: { ids?: string[]; batchId?: string },
): Promise<string[]> {
  let q = db.from("dataset_rows").select("source_item_id");
  if (filter.batchId) q = q.eq("batch_id", filter.batchId);
  if (filter.ids) q = q.in("id", filter.ids);
  const { data, error } = await q;
  if (error) return [];
  return [...new Set((data ?? []).map((r) => r.source_item_id).filter(Boolean))] as string[];
}

export async function acceptProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const sources = await sourceItemsFor(db, { ids: [proposalId] });
    const res = await acceptProposal(db, proposalId);
    if (res) await checkpoint(db, res.datasetId, res.summary, async () => {}, res.actor);
    await dereferenceItems(sources);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to apply the change." };
  }
}

export async function rejectProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const sources = await sourceItemsFor(db, { ids: [proposalId] });
    await rejectProposal(db, proposalId);
    await dereferenceItems(sources);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to dismiss the change." };
  }
}

export async function acceptBatchAction(batchId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const sources = await sourceItemsFor(db, { batchId });
    const res = await acceptBatch(db, batchId);
    if (res) await checkpoint(db, res.datasetId, res.summary, async () => {}, res.actor);
    await dereferenceItems(sources);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to accept the changes." };
  }
}

export async function rejectBatchAction(batchId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const sources = await sourceItemsFor(db, { batchId });
    await rejectBatch(db, batchId);
    await dereferenceItems(sources);
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
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const sources = await sourceItemsFor(db, { ids });
    const results = await acceptProposals(db, ids);
    for (const r of results) await checkpoint(db, r.datasetId, r.summary, async () => {}, r.actor);
    await dereferenceItems(sources);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to accept the changes." };
  }
}

/** Reject (discard) an arbitrary set of proposals. */
export async function rejectProposalsAction(ids: string[]): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const sources = await sourceItemsFor(db, { ids });
    await rejectProposals(db, ids);
    await dereferenceItems(sources);
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
    const { db, user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    await createRelation(db, org.id, { ...input, createdBy: user.id });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to create relationship." };
  }
}

export async function deleteRelationAction(id: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await deleteRelation(db, id);
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
    const { db, user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    const address = await regenerateInbox(db, org.id, user.id);
    revalidatePath("/dashboard");
    return { ok: true, address };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to regenerate inbox." };
  }
}

// ---------------------------------------------------------------------------
// Messaging channels (WhatsApp / Slack / Teams) — the forward-to-a-contact bots.
// Unlike email (routed by a unique recipient address), these route by SENDER:
// the user links their platform identity once, then anything they forward to the
// shared bot is attributed to them. See lib/channels/*.
// ---------------------------------------------------------------------------

export type ChannelStatus = {
  id: ChannelId;
  label: string;
  botHandle: string | null;
  configured: boolean;
  canReply: boolean;
  linkedHandle: string | null;
};

export type ChannelsResult =
  | { ok: true; channels: ChannelStatus[] }
  | { ok: false; error: string };

/** Status of each messaging channel for the signed-in user: whether the server
 *  has it configured, the bot handle to forward to, and any linked identity. */
export async function listChannelsAction(): Promise<ChannelsResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    const channels = await Promise.all(
      allChannelInfo().map(async (info) => ({
        ...info,
        linkedHandle: await linkedHandle(db, user.id, info.id).catch(() => null),
      })),
    );
    return { ok: true, channels };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to load channels." };
  }
}

export type LinkCodeResult =
  | { ok: true; code: string; botHandle: string | null; channel: ChannelId }
  | { ok: false; error: string };

/** Mint a one-time link code the user sends to the bot to connect a channel. */
export async function startChannelLinkAction(channel: string): Promise<LinkCodeResult> {
  try {
    const { db, user, org } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!org) return { ok: false, error: "No organization found." };
    if (!isChannelId(channel)) return { ok: false, error: "Unknown channel." };
    const info = channelInfo(channel);
    if (!info.configured) {
      return { ok: false, error: `${info.label} isn’t set up on the server yet.` };
    }
    const code = await mintLinkCode(db, org.id, user.id, channel);
    return { ok: true, code, botHandle: info.botHandle, channel };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to start linking." };
  }
}

export async function setAgentStatusAction(
  agentId: string,
  status: "active" | "paused",
): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await setAgentStatus(db, agentId, status);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to update agent." };
  }
}

export async function deleteAgentAction(agentId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await deleteAgent(db, agentId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to delete agent." };
  }
}
