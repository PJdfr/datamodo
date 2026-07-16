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
    // Raw aggregation: Prisma's groupBy can't fold a boolean (`_max` on
    // `estimated` emits max(boolean), which Postgres rejects — 42883). The
    // group semantics we want ARE bool_or: "any row in the group was an
    // estimate" / "any call hit an unpriced model".
    const rows = await prisma.$queryRaw<{
      provider: string; model: string; calls: number;
      input_tokens: number; output_tokens: number;
      cost_usd: number | null; estimated: boolean; has_unpriced: boolean;
    }[]>`
      select provider, model,
             count(*)::int                    as calls,
             coalesce(sum(input_tokens), 0)::int  as input_tokens,
             coalesce(sum(output_tokens), 0)::int as output_tokens,
             sum(cost_usd)::double precision  as cost_usd,
             bool_or(estimated)               as estimated,
             bool_or(cost_usd is null)        as has_unpriced
        from public.llm_usage
       where org_id = ${orgId}::uuid and created_at >= ${since}
       group by provider, model`;
    const byModel = rows
      .map((r) => ({
        provider: r.provider,
        model: r.model,
        calls: r.calls,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        costUsd: r.cost_usd,
        estimated: r.estimated ?? true,
      }))
      .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0) || b.calls - a.calls);

    return {
      since: since.toISOString(),
      totalCostUsd: byModel.reduce((n, m) => n + (m.costUsd ?? 0), 0),
      hasUnpriced: rows.some((r) => r.has_unpriced && (r.input_tokens > 0 || r.output_tokens > 0)),
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

/** BYOK spend so far THIS CALENDAR MONTH (UTC) — what the monthly cap is
 *  measured against. Unpriced calls count as $0 (the cap is a safety rail on
 *  what we can price, not an invoice). FAIL-SOFT to 0: a ledger error must
 *  never stop extraction — the cap simply can't engage without data. */
export async function monthToDateSpendUsd(orgId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<{ total: number | null }[]>`
      select sum(cost_usd)::double precision as total
        from public.llm_usage
       where org_id = ${orgId}::uuid
         and created_at >= date_trunc('month', now() at time zone 'utc')`;
    return rows[0]?.total ?? 0;
  } catch {
    return 0;
  }
}
