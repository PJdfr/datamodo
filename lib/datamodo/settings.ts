import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiProvider, ComputeMode, Plan } from "./plans";
import { planLimits } from "./plans";

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
export async function getSettings(db: SupabaseClient, userId: string): Promise<UserSettings> {
  const { data, error } = await db
    .from("user_settings")
    .select("plan, compute_mode, ai_provider, byok_key, plan_status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULTS;
  const d = data as {
    plan: Plan; compute_mode: ComputeMode; ai_provider: AiProvider;
    byok_key: string | null; plan_status: string | null; current_period_end: string | null;
  };
  return {
    plan: d.plan ?? "free",
    computeMode: (d.compute_mode as ComputeMode) ?? "byok",
    aiProvider: (d.ai_provider as AiProvider) ?? "anthropic",
    byokKeySet: !!d.byok_key,
    planStatus: d.plan_status,
    currentPeriodEnd: d.current_period_end,
  };
}

/** Server-only: the raw key, for calling the provider (never sent to the client). */
export async function getByokKey(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from("user_settings")
    .select("byok_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { byok_key: string | null } | null)?.byok_key ?? null;
}

/**
 * Update how the user's data is analysed. Enforces the plan rule that Datamodo
 * cloud compute is a paid feature — Free must bring their own key.
 */
export async function updateComputeSettings(
  db: SupabaseClient,
  userId: string,
  patch: { computeMode?: ComputeMode; aiProvider?: AiProvider; byokKey?: string | null },
): Promise<void> {
  const current = await getSettings(db, userId);
  const limits = planLimits(current.plan);

  const update: Record<string, unknown> = {};
  if (patch.computeMode !== undefined) {
    if (patch.computeMode === "cloud" && !limits.cloudCompute) {
      throw new Error("Datamodo cloud compute is a Pro feature. On Free, bring your own API key.");
    }
    update.compute_mode = patch.computeMode;
  }
  if (patch.aiProvider !== undefined) update.ai_provider = patch.aiProvider;
  if (patch.byokKey !== undefined) update.byok_key = patch.byokKey?.trim() || null;

  if (Object.keys(update).length === 0) return;

  // Upsert so a missing row (older account) is created on first save.
  const { error } = await db
    .from("user_settings")
    .upsert({ user_id: userId, ...update }, { onConflict: "user_id" });
  if (error) throw error;
}

// --- Onboarding context (steers extraction) --------------------------------

export interface OnboardingContext {
  /** Free-text "what do you do" — the strongest steer for the extractor. */
  businessContext: string | null;
  /** Structured QCM answers (industry, entity types, etc.). */
  answers: Record<string, unknown>;
}

/** Load the user's onboarding context (used to build the extraction prompt). */
export async function getOnboardingContext(db: SupabaseClient, userId: string): Promise<OnboardingContext> {
  const { data, error } = await db
    .from("user_settings")
    .select("business_context, onboarding")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const d = data as { business_context: string | null; onboarding: Record<string, unknown> | null } | null;
  return { businessContext: d?.business_context ?? null, answers: d?.onboarding ?? {} };
}

/** Save onboarding answers (asked once at signup). */
export async function saveOnboarding(
  db: SupabaseClient,
  userId: string,
  ctx: { businessContext?: string | null; answers?: Record<string, unknown> },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (ctx.businessContext !== undefined) update.business_context = ctx.businessContext?.trim() || null;
  if (ctx.answers !== undefined) update.onboarding = ctx.answers;
  if (Object.keys(update).length === 0) return;
  const { error } = await db.from("user_settings").upsert({ user_id: userId, ...update }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Count the user's agents (for the max-agents entitlement). */
export async function countAgents(db: SupabaseClient, ownerUserId: string): Promise<number> {
  const { count, error } = await db
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId);
  if (error) throw error;
  return count ?? 0;
}

/** Set a user's plan + Stripe linkage (called by the billing webhook). */
export async function setPlanFromStripe(
  db: SupabaseClient,
  userId: string,
  fields: { plan: Plan; status: string; customerId?: string; subscriptionId?: string; periodEnd?: string | null },
): Promise<void> {
  const { error } = await db.from("user_settings").upsert({
    user_id: userId,
    plan: fields.plan,
    plan_status: fields.status,
    stripe_customer_id: fields.customerId,
    stripe_subscription_id: fields.subscriptionId,
    current_period_end: fields.periodEnd ?? null,
  }, { onConflict: "user_id" });
  if (error) throw error;
}
