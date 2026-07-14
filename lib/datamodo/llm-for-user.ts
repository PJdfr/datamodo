import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import { getByokKey, getSettings } from "./settings";

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
  if (userId) {
    try {
      const [settings, key] = await Promise.all([getSettings(userId), getByokKey(userId)]);
      if (settings.computeMode === "byok" && key) {
        if (settings.aiProvider === "ollama") return getLlmProvider("ollama", undefined, { baseUrl: key });
        return getLlmProvider(settings.aiProvider, key);
      }
    } catch {
      // settings lookup must never take extraction down — fall through
    }
  }
  return getLlmProvider();
}
