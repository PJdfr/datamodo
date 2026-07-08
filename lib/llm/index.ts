import { OpenAICompatibleProvider } from "./openai-compatible";
import { AnthropicProvider } from "./anthropic";
import type { LlmProvider, ProviderName } from "./types";

export type { LlmProvider, ProviderName, ChatJsonRequest, LlmModels } from "./types";

const env = (k: string) => process.env[k]?.trim() || undefined;

/**
 * Resolve an LLM provider. Routing precedence: explicit `name` arg → LLM_PROVIDER
 * env → "openrouter". Pass `apiKey` to use a user's BYOK key instead of the env
 * key. Model ids are env-overridable per provider.
 */
export function getLlmProvider(name?: ProviderName, apiKey?: string): LlmProvider {
  const provider = name ?? (env("LLM_PROVIDER") as ProviderName | undefined) ?? "openrouter";
  switch (provider) {
    case "openai":
      return new OpenAICompatibleProvider({
        name: "openai",
        baseUrl: env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
        apiKey: apiKey ?? env("OPENAI_API_KEY"),
        models: {
          extract: env("OPENAI_EXTRACT_MODEL") ?? "gpt-4o-mini",
          escalate: env("OPENAI_ESCALATE_MODEL") ?? "gpt-4.1",
        },
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: apiKey ?? env("ANTHROPIC_API_KEY"),
        models: {
          extract: env("ANTHROPIC_EXTRACT_MODEL") ?? "claude-haiku-4-5",
          escalate: env("ANTHROPIC_ESCALATE_MODEL") ?? "claude-sonnet-5",
        },
      });
    case "openrouter":
    default:
      return new OpenAICompatibleProvider({
        name: "openrouter",
        baseUrl: env("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
        apiKey: apiKey ?? env("OPENROUTER_API_KEY"),
        models: {
          // Free defaults for dev; set env to a paid model for reliability.
          extract: env("OPENROUTER_EXTRACT_MODEL") ?? "cohere/north-mini-code:free",
          escalate: env("OPENROUTER_ESCALATE_MODEL") ?? "cohere/north-mini-code:free",
        },
        extraHeaders: {
          "HTTP-Referer": env("OPENROUTER_APP_URL") ?? "https://datamodo.dev",
          "X-Title": "datamodo",
        },
      });
  }
}
