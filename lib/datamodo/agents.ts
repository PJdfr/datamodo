import { prisma } from "@/lib/prisma";
import type { AgentRecord, NewAgentInput } from "./types";

// Data access for agents. Every call goes through the caller's authenticated
// Supabase client, so RLS (owner-only) gates every row — these helpers never
// bypass it. Agents are private to their owner; there is no sharing.

export async function listAgents(orgId: string): Promise<AgentRecord[]> {
  const rows = await prisma.agents.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "asc" },
  });
  return rows as unknown as AgentRecord[];
}

export async function createAgent(
  orgId: string,
  ownerUserId: string,
  input: NewAgentInput,
): Promise<AgentRecord> {
  const name = input.name?.trim();
  if (!name) throw new Error("Agent name is required");

  const created = (await prisma.agents.create({
    data: {
      org_id: orgId,
      owner_user_id: ownerUserId,
      name,
      purpose_text: input.purposeText?.trim() || null,
      purpose: input.purpose ?? "curate",
      channels: input.channels ?? [],
      mode: input.mode ?? "auto",
      freestyle: input.freestyle ?? false,
      avatar_bg: input.avatarBg ?? null,
    },
  })) as unknown as AgentRecord;

  // Best-effort: bind existing datasets (by name) to the new agent.
  if (!input.freestyle && input.targetDatasetNames?.length) {
    await prisma.datasets.updateMany({
      where: {
        org_id: orgId,
        name: { in: input.targetDatasetNames },
      },
      data: { agent_id: created.id },
    });
  }

  return created;
}

export async function updateAgent(
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

  await prisma.agents.update({ where: { id: agentId }, data: update });
}

export async function setAgentStatus(
  agentId: string,
  status: "active" | "paused",
): Promise<void> {
  await prisma.agents.update({ where: { id: agentId }, data: { status } });
}

export async function deleteAgent(agentId: string): Promise<void> {
  await prisma.agents.delete({ where: { id: agentId } });
}
