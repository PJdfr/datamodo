import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import { getByokKey, getSettings } from "./settings";
import { getActiveOrg } from "./orgs";
import { usageHooks } from "./usage";
import { isLocalMode } from "@/lib/local/config";
import { readLocalLlmModels } from "@/lib/local/llm-config";

/**
 * Resolve the LLM provider to use for work done on behalf of one user.
 *
 * BYOK: when the user's compute mode is "byok" and they saved a credential,
 * calls run against THEIR account/server — their messages never touch our
 * env-key account. For key-billed providers the credential is an API key;
 * for OLLAMA it's their server's BASE URL (keyless by design — the same
 * stored field, different meaning). Otherwise (cloud mode, or nothing saved
 * yet) we fall back to the platform provider from env.
 */
export async function llmForUser(userId: string | null): Promise<LlmProvider> {
  // Local edition: per-user model overrides set from the dashboard (llm.json).
  // Precedence inside getLlmProvider is: these → env → default.
  const models = isLocalMode() ? await readLocalLlmModels().catch(() => undefined) : undefined;
  if (userId) {
    try {
      const [settings, key, org] = await Promise.all([getSettings(userId), getByokKey(userId), getActiveOrg(userId)]);
      if (settings.computeMode === "byok" && key) {
        // Track spend on the user's OWN key (never on our platform key in
        // cloud mode — that's on us, not them). Recording is fail-soft.
        const hooks = org ? usageHooks(org.id, userId) : undefined;
        if (settings.aiProvider === "ollama") return getLlmProvider("ollama", undefined, { baseUrl: key, hooks, models });
        return getLlmProvider(settings.aiProvider, key, { hooks, models });
      }
    } catch {
      // settings lookup must never take extraction down — fall through
    }
  }
  return getLlmProvider(undefined, undefined, { models });
}
