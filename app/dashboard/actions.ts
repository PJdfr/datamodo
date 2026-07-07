"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { createAgent, deleteAgent, setAgentStatus, updateAgent } from "@/lib/datamodo/agents";
import {
  addColumn,
  createDataset,
  deleteDataset,
  deleteRow,
  insertRow,
  removeColumn,
  renameDataset,
  setColumns,
  updateRow,
} from "@/lib/datamodo/datasets";
import type { DatasetColumn, NewAgentInput } from "@/lib/datamodo/types";

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

    await createAgent(db, org.id, user.id, input);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to create agent." };
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
    await addColumn(db, datasetId, column);
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
    await removeColumn(db, datasetId, key);
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
    await insertRow(db, org.id, datasetId, data, { createdBy: user.id });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to add row." };
  }
}

export async function updateRowAction(
  rowId: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await updateRow(db, rowId, data);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to update row." };
  }
}

export async function deleteRowAction(rowId: string): Promise<ActionResult> {
  try {
    const { db, user } = await ctx();
    if (!user) return { ok: false, error: "Not signed in." };
    await deleteRow(db, rowId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Failed to delete row." };
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
