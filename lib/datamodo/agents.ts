import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRecord, NewAgentInput } from "./types";

// Data access for agents. Every call goes through the caller's authenticated
// Supabase client, so RLS (owner-only) gates every row — these helpers never
// bypass it. Agents are private to their owner; there is no sharing.

export async function listAgents(
  db: SupabaseClient,
  orgId: string,
): Promise<AgentRecord[]> {
  const { data, error } = await db
    .from("agents")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AgentRecord[];
}

export async function createAgent(
  db: SupabaseClient,
  orgId: string,
  ownerUserId: string,
  input: NewAgentInput,
): Promise<AgentRecord> {
  const name = input.name?.trim();
  if (!name) throw new Error("Agent name is required");

  const { data: agent, error } = await db
    .from("agents")
    .insert({
      org_id: orgId,
      owner_user_id: ownerUserId,
      name,
      purpose_text: input.purposeText?.trim() || null,
      purpose: input.purpose ?? "curate",
      channels: input.channels ?? [],
      mode: input.mode ?? "auto",
      freestyle: input.freestyle ?? false,
      avatar_bg: input.avatarBg ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  const created = agent as AgentRecord;

  // Best-effort: bind existing datasets (by name) to the new agent.
  if (!input.freestyle && input.targetDatasetNames?.length) {
    const { error: linkErr } = await db
      .from("datasets")
      .update({ agent_id: created.id })
      .eq("org_id", orgId)
      .in("name", input.targetDatasetNames);
    if (linkErr) throw linkErr;
  }

  return created;
}

export async function updateAgent(
  db: SupabaseClient,
  agentId: string,
  patch: {
    name?: string;
    purposeText?: string | null;
    channels?: string[];
    mode?: "auto" | "ping";
    status?: "active" | "paused";
    freestyle?: boolean;
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Agent name is required");
    update.name = name;
  }
  if (patch.purposeText !== undefined) update.purpose_text = patch.purposeText?.trim() || null;
  if (patch.channels !== undefined) update.channels = patch.channels;
  if (patch.mode !== undefined) update.mode = patch.mode;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.freestyle !== undefined) update.freestyle = patch.freestyle;
  if (Object.keys(update).length === 0) return;

  const { error } = await db.from("agents").update(update).eq("id", agentId);
  if (error) throw error;
}

export async function setAgentStatus(
  db: SupabaseClient,
  agentId: string,
  status: "active" | "paused",
): Promise<void> {
  const { error } = await db
    .from("agents")
    .update({ status })
    .eq("id", agentId);
  if (error) throw error;
}

export async function deleteAgent(
  db: SupabaseClient,
  agentId: string,
): Promise<void> {
  const { error } = await db.from("agents").delete().eq("id", agentId);
  if (error) throw error;
}
