"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { createAgent, deleteAgent, setAgentStatus } from "@/lib/datamodo/agents";
import { createDataset } from "@/lib/datamodo/datasets";
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
