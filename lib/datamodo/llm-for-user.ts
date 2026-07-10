import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import { getByokKey, getSettings } from "./settings";

/**
 * Resolve the LLM provider to use for work done on behalf of one user.
 *
 * BYOK: when the user's compute mode is "byok" and they saved a key, calls run
 * against THEIR provider account (settings.aiProvider + their key) — their
 * messages never touch our env-key account. Otherwise (cloud mode, or no key
 * saved yet) we fall back to the platform provider from env.
 */
export async function llmForUser(userId: string | null): Promise<LlmProvider> {
  if (userId) {
    try {
      const [settings, key] = await Promise.all([getSettings(userId), getByokKey(userId)]);
      if (settings.computeMode === "byok" && key) {
        return getLlmProvider(settings.aiProvider, key);
      }
    } catch {
      // settings lookup must never take extraction down — fall through
    }
  }
  return getLlmProvider();
}
