// BYOK USAGE LEDGER (DB side) — records what the user's OWN LLM key cost and
// summarizes it. The provider layer surfaces token usage via `onUsage`
// (lib/llm/*); `usageHooks` builds the recorder that `llmForUser` wires when
// the user is on BYOK. Writing is FAIL-SOFT: a lost row is an imperfect
// estimate, never a billing error — extraction must never break because a
// usage insert failed (or the table isn't migrated yet).

import { prisma } from "@/lib/prisma";
import type { LlmUsage, ProviderHooks } from "@/lib/llm";
import { estimateCostUsd } from "./llm-cost";

/** Record one call's usage. Cost: the provider's exact number when present
 *  (OpenRouter), else estimated from the token counts. Never throws. */
export async function recordUsage(orgId: string, userId: string, u: LlmUsage): Promise<void> {
  try {
    const provided = typeof u.costUsd === "number";
    const cost = provided ? u.costUsd : estimateCostUsd(u.model, u.inputTokens, u.outputTokens);
    await prisma.llm_usage.create({
      data: {
        org_id: orgId,
        user_id: userId,
        provider: u.provider,
        model: u.model,
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        cost_usd: cost,
        estimated: !provided,
      },
    });
  } catch (e) {
    // Table not migrated yet, or a transient DB hiccup — usage is best-effort.
    console.error("[usage] record failed (non-fatal)", (e as Error)?.message);
  }
}

/** Build the provider hook that records BYOK usage for one user/org. The
 *  DB write is fire-and-forget (kept alive by the surrounding extraction that
 *  awaits its own DB work) so the LLM path is never slowed or blocked. */
export function usageHooks(orgId: string, userId: string): ProviderHooks {
  return {
    onUsage: (u) => { void recordUsage(orgId, userId, u); },
  };
}

export interface UsageSummary {
  /** UTC window start (ISO) the totals cover. */
  since: string;
  totalCostUsd: number;
  /** True when at least one call in the window was an unpriced model — the
   *  total is then a floor, not a full figure. */
  hasUnpriced: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Per-model breakdown, biggest spend first. */
  byModel: {
    provider: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null; // null = unpriced model (tokens only)
    estimated: boolean;      // any row in the group was an estimate
  }[];
}

/** Aggregate an org's BYOK spend over the last `days` (default 30). Pure SQL
 *  aggregation; empty/zeroed when the ledger has nothing (or isn't migrated). */
export async function usageSummary(orgId: string, opts: { days?: number } = {}): Promise<UsageSummary> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 86400_000);
  const empty: UsageSummary = {
    since: since.toISOString(), totalCostUsd: 0, hasUnpriced: false,
    calls: 0, inputTokens: 0, outputTokens: 0, byModel: [],
  };
  try {
    const rows = await prisma.llm_usage.groupBy({
      by: ["provider", "model"],
      where: { org_id: orgId, created_at: { gte: since } },
      _count: { _all: true },
      _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
      _max: { estimated: true },
    });
    const byModel = rows
      .map((r) => ({
        provider: r.provider,
        model: r.model,
        calls: r._count._all,
        inputTokens: r._sum.input_tokens ?? 0,
        outputTokens: r._sum.output_tokens ?? 0,
        costUsd: r._sum.cost_usd ?? null,
        estimated: r._max.estimated ?? true,
      }))
      .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0) || b.calls - a.calls);

    return {
      since: since.toISOString(),
      totalCostUsd: byModel.reduce((n, m) => n + (m.costUsd ?? 0), 0),
      hasUnpriced: byModel.some((m) => m.costUsd === null && (m.inputTokens > 0 || m.outputTokens > 0)),
      calls: byModel.reduce((n, m) => n + m.calls, 0),
      inputTokens: byModel.reduce((n, m) => n + m.inputTokens, 0),
      outputTokens: byModel.reduce((n, m) => n + m.outputTokens, 0),
      byModel,
    };
  } catch (e) {
    console.error("[usage] summary failed (ledger may be unmigrated)", (e as Error)?.message);
    return empty;
  }
}
