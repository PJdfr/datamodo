import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentActivityEntry } from "./types";
import { listPendingChanges } from "./review";

// The Agents surface feed: what each agent has actually been doing — changes it
// applied (recorded as snapshots whose `actor` is the agent) and changes it's
// still proposing (pending review). Keyed by agent name.

const MAX_PER_AGENT = 8;

export async function listAgentActivity(
  db: SupabaseClient,
  orgId: string,
): Promise<Record<string, AgentActivityEntry[]>> {
  const byAgent: Record<string, AgentActivityEntry[]> = {};
  const push = (agent: string, e: AgentActivityEntry) => {
    (byAgent[agent] ??= []).push(e);
  };

  // Applied changes: snapshots attributed to an agent (actor <> 'You').
  const { data: snaps, error: snapErr } = await db
    .from("dataset_snapshots")
    .select("id, actor, summary, created_at, datasets ( name )")
    .eq("org_id", orgId)
    .neq("actor", "You")
    .order("created_at", { ascending: false })
    .limit(60);
  if (snapErr) throw snapErr;
  for (const s of (snaps ?? []) as unknown as {
    id: string;
    actor: string;
    summary: string;
    created_at: string;
    datasets: { name: string } | { name: string }[] | null;
  }[]) {
    const dsName = Array.isArray(s.datasets) ? s.datasets[0]?.name : s.datasets?.name;
    push(s.actor, {
      id: s.id,
      kind: "applied",
      datasetName: dsName ?? "a table",
      summary: s.summary,
      sourceLabel: null,
      adds: 0,
      updates: 0,
      conflicts: 0,
      when: s.created_at,
    });
  }

  // Pending changes: group this agent's proposals by comm chunk (batch).
  const pending = await listPendingChanges(db, orgId);
  const groups = new Map<
    string,
    { agent: string; datasetName: string; sourceLabel: string | null; adds: number; updates: number; conflicts: number; when: string }
  >();
  for (const item of pending) {
    const key = `${item.agent}::${item.batchId ?? item.id}`;
    const g = groups.get(key) ?? {
      agent: item.agent,
      datasetName: item.datasetName,
      sourceLabel: item.sourceLabel,
      adds: 0,
      updates: 0,
      conflicts: 0,
      when: item.createdAt,
    };
    if (item.kind === "add") g.adds++; else g.updates++;
    if (item.conflict) g.conflicts++;
    if (item.createdAt > g.when) g.when = item.createdAt;
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const parts: string[] = [];
    if (g.adds) parts.push(`${g.adds} new row${g.adds === 1 ? "" : "s"}`);
    if (g.updates) parts.push(`${g.updates} change${g.updates === 1 ? "" : "s"}`);
    push(g.agent, {
      id: key,
      kind: "pending",
      datasetName: g.datasetName,
      summary: g.sourceLabel ? `Parsed “${g.sourceLabel}” → ${parts.join(", ")}` : `Proposed ${parts.join(", ")}`,
      sourceLabel: g.sourceLabel,
      adds: g.adds,
      updates: g.updates,
      conflicts: g.conflicts,
      when: g.when,
    });
  }

  // Newest first, capped per agent.
  for (const agent of Object.keys(byAgent)) {
    byAgent[agent].sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
    byAgent[agent] = byAgent[agent].slice(0, MAX_PER_AGENT);
  }
  return byAgent;
}
