import { getLlmProvider, type LlmProvider, type ProviderName } from "@/lib/llm";
import { getByokKey, getSettings } from "./settings";
import { getActiveOrg } from "./orgs";
import { usageHooks } from "./usage";
import { isLocalMode, type LocalAiProvider, type LocalLlmFile } from "@/lib/local/config";

/**
 * Resolve the LLM provider to use for work done on behalf of one user.
 *
 * BYOK: when the user's compute mode is "byok" and they saved a credential,
 * calls run against THEIR account/server — their messages never touch our
 * env-key account. For key-billed providers the credential is an API key;
 * for OLLAMA it's their server's BASE URL (keyless by design — the same
 * stored field, different meaning). Otherwise (cloud mode, or nothing saved
 * yet) we fall back to the platform provider from env.
 *
 * LOCAL edition: dashboard model overrides (llm.json) are PER PROVIDER — the
 * models saved for the provider actually being called are the only ones
 * applied, so the wizard's Ollama names (llama3.1:8b…) never reach a BYOK
 * Anthropic/OpenAI/OpenRouter request. Precedence inside getLlmProvider stays
 * dashboard → env → default.
 */
export async function llmForUser(userId: string | null): Promise<LlmProvider> {
  let file: LocalLlmFile | undefined;
  if (isLocalMode()) {
    const { readLocalLlmFile } = await import("@/lib/local/llm-config");
    file = await readLocalLlmFile().catch(() => undefined);
  }
  const modelsFor = (p: ProviderName) => file?.providers[p as LocalAiProvider];

  if (userId) {
    try {
      const [settings, key, org] = await Promise.all([getSettings(userId), getByokKey(userId), getActiveOrg(userId)]);
      if (settings.computeMode === "byok" && key) {
        // MONTHLY SPEND CAP: before burning the user's key, check the ledger.
        // Ollama-as-BYOK is keyless/free — the cap only guards key-billed
        // providers. Decision is pure (llm-cost.ts); the ledger read is
        // fail-soft (errors → cap can't engage, extraction never stops here).
        if (settings.aiProvider !== "ollama" && settings.byokMonthlyCapUsd != null && org) {
          const { monthToDateSpendUsd } = await import("./usage");
          const { byokCapDecision } = await import("./llm-cost");
          const spent = await monthToDateSpendUsd(org.id);
          const decision = byokCapDecision(spent, settings.byokMonthlyCapUsd, isLocalMode());
          if (decision === "fallback") {
            // Local edition: the machine's own Ollama is free — use it and say so.
            console.log(`[llm] BYOK monthly cap reached ($${spent.toFixed(2)} of $${settings.byokMonthlyCapUsd}) — falling back to local compute`);
            return getLlmProvider("ollama", undefined, { models: modelsFor("ollama"), baseUrl: file?.url });
          }
          if (decision === "block") {
            // Cloud: every alternative bills someone. Fail the item with a
            // clear, requeue-able reason instead of silently spending.
            throw new Error(`BYOK monthly cap reached ($${spent.toFixed(2)} of $${settings.byokMonthlyCapUsd}) — raise the cap in Settings or wait for the new month, then requeue.`);
          }
        }
        // Track spend on the user's OWN key (never on our platform key in
        // cloud mode — that's on us, not them). Recording is fail-soft.
        const hooks = org ? usageHooks(org.id, userId) : undefined;
        const models = modelsFor(settings.aiProvider);
        if (settings.aiProvider === "ollama") return getLlmProvider("ollama", undefined, { baseUrl: key, hooks, models });
        return getLlmProvider(settings.aiProvider, key, { hooks, models });
      }
    } catch (e) {
      // Settings lookup must never take extraction down — fall through. The
      // ONE exception is the cap block: that error is the feature, rethrow.
      if (String((e as Error)?.message ?? "").includes("BYOK monthly cap reached")) throw e;
    }
  }
  // Platform default. Locally that's the machine's own Ollama (serve sets
  // LLM_PROVIDER=ollama); resolve the SAME name getLlmProvider will use so
  // the right provider's saved models are applied. The dashboard's saved
  // server URL (llm.json `url`) beats OLLAMA_BASE_URL env, which beats
  // localhost (baseUrl only applies when the resolved provider is ollama).
  const envProvider = (process.env.LLM_PROVIDER?.trim() as ProviderName | undefined) || (isLocalMode() ? "ollama" : "openrouter");
  return getLlmProvider(undefined, undefined, { models: modelsFor(envProvider), baseUrl: file?.url });
}
