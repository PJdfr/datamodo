import { prisma } from "@/lib/prisma";
import type { AiProvider, ComputeMode, Plan } from "./plans";
import { planLimits } from "./plans";
import { isLocalMode } from "@/lib/local/config";

// Per-user settings: plan + how their data is analysed. Client-safe shape never
// includes the raw BYOK key — only whether one is set.

export interface UserSettings {
  plan: Plan;
  computeMode: ComputeMode;
  aiProvider: AiProvider;
  byokKeySet: boolean;
  planStatus: string | null;
  currentPeriodEnd: string | null;
}

const DEFAULTS: UserSettings = {
  plan: "free",
  computeMode: "byok",
  aiProvider: "anthropic",
  byokKeySet: false,
  planStatus: null,
  currentPeriodEnd: null,
};

/** Load the caller's settings (byok_key reduced to a boolean for the client). */
export async function getSettings(userId: string): Promise<UserSettings> {
  const data = await prisma.user_settings.findFirst({
    where: { user_id: userId },
    select: {
      plan: true,
      compute_mode: true,
      ai_provider: true,
      byok_key: true,
      plan_status: true,
      current_period_end: true,
    },
  });
  if (!data) return DEFAULTS;
  return {
    plan: (data.plan as Plan) ?? "free",
    computeMode: (data.compute_mode as ComputeMode) ?? "byok",
    aiProvider: (data.ai_provider as AiProvider) ?? "anthropic",
    byokKeySet: !!data.byok_key,
    planStatus: data.plan_status,
    currentPeriodEnd: data.current_period_end ? data.current_period_end.toISOString() : null,
  };
}

/** Server-only: the raw key, for calling the provider (never sent to the client). */
export async function getByokKey(userId: string): Promise<string | null> {
  const data = await prisma.user_settings.findFirst({
    where: { user_id: userId },
    select: { byok_key: true },
  });
  return data?.byok_key ?? null;
}

/**
 * Update how the user's data is analysed. Enforces the plan rule that Datamodo
 * cloud compute is a paid feature — Free must bring their own key.
 */
export async function updateComputeSettings(
  userId: string,
  patch: { computeMode?: ComputeMode; aiProvider?: AiProvider; byokKey?: string | null },
): Promise<void> {
  const current = await getSettings(userId);
  const limits = planLimits(current.plan);

  const update: Record<string, unknown> = {};
  if (patch.computeMode !== undefined) {
    // Local edition: "cloud" here means "local compute on this machine's
    // Ollama" (the platform default) — free by definition, no plan gate.
    if (patch.computeMode === "cloud" && !limits.cloudCompute && !isLocalMode()) {
      throw new Error("Datamodo cloud compute is a Pro feature. On Free, bring your own API key.");
    }
    update.compute_mode = patch.computeMode;
  }
  if (patch.aiProvider !== undefined) update.ai_provider = patch.aiProvider;
  if (patch.byokKey !== undefined) update.byok_key = patch.byokKey?.trim() || null;

  if (Object.keys(update).length === 0) return;

  // Upsert so a missing row (older account) is created on first save.
  await prisma.user_settings.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...update },
    update,
  });
}

// --- Onboarding context (steers extraction) --------------------------------

export interface OnboardingContext {
  /** Free-text "what do you do" — the strongest steer for the extractor. */
  businessContext: string | null;
  /** Structured QCM answers (industry, entity types, etc.). */
  answers: Record<string, unknown>;
}

/** Load the user's onboarding context (used to build the extraction prompt). */
export async function getOnboardingContext(userId: string): Promise<OnboardingContext> {
  const data = await prisma.user_settings.findFirst({
    where: { user_id: userId },
    select: { business_context: true, onboarding: true },
  });
  return {
    businessContext: data?.business_context ?? null,
    answers: (data?.onboarding as Record<string, unknown>) ?? {},
  };
}

/** Save onboarding answers (asked once at signup). */
export async function saveOnboarding(
  userId: string,
  ctx: { businessContext?: string | null; answers?: Record<string, unknown> },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (ctx.businessContext !== undefined) update.business_context = ctx.businessContext?.trim() || null;
  if (ctx.answers !== undefined) update.onboarding = ctx.answers;
  if (Object.keys(update).length === 0) return;
  await prisma.user_settings.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...update },
    update,
  });
}

/** Count the user's agents (for the max-agents entitlement). */
export async function countAgents(ownerUserId: string): Promise<number> {
  const count = await prisma.agents.count({ where: { owner_user_id: ownerUserId } });
  return count ?? 0;
}

/** Set a user's plan + Stripe linkage (called by the billing webhook). */
export async function setPlanFromStripe(
  userId: string,
  fields: { plan: Plan; status: string; customerId?: string; subscriptionId?: string; periodEnd?: string | null },
): Promise<void> {
  const data = {
    plan: fields.plan,
    plan_status: fields.status,
    stripe_customer_id: fields.customerId,
    stripe_subscription_id: fields.subscriptionId,
    current_period_end: fields.periodEnd ? new Date(fields.periodEnd) : null,
  };
  await prisma.user_settings.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...data },
    update: data,
  });
}
