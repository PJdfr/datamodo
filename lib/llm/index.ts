import { OpenAICompatibleProvider } from "./openai-compatible.ts";
import { AnthropicProvider } from "./anthropic.ts";
import type { LlmModels, LlmProvider, ProviderHooks, ProviderName } from "./types";

export type { LlmProvider, ProviderName, ChatJsonRequest, LlmModels, LlmUsage, ProviderHooks } from "./types";

const env = (k: string) => process.env[k]?.trim() || undefined;

/** A pasted Ollama URL is usually the bare server ("http://localhost:11434")
 *  — the OpenAI-compatible surface lives under /v1. Append it only when the
 *  URL has no path, so proxied setups keep their custom paths. */
export function normalizeOllamaUrl(url: string): string {
  const clean = url.trim().replace(/\/+$/, "");
  try {
    if (new URL(clean).pathname === "/") return `${clean}/v1`;
  } catch {
    return clean; // not parseable — pass through, the call will surface it
  }
  return clean;
}

/**
 * Resolve an LLM provider. Routing precedence: explicit `name` arg → LLM_PROVIDER
 * env → "openrouter". Pass `apiKey` to use a user's BYOK key instead of the env
 * key; `opts.baseUrl` points a KEYLESS provider (ollama) at the user's own
 * server. Model ids resolve by precedence: `opts.models` (per-user, e.g. set
 * from the dashboard) → env override → built-in default.
 */
export function getLlmProvider(
  name?: ProviderName,
  apiKey?: string,
  opts: { baseUrl?: string; hooks?: ProviderHooks; models?: Partial<LlmModels> } = {},
): LlmProvider {
  const provider = name ?? (env("LLM_PROVIDER") as ProviderName | undefined) ?? "openrouter";
  const hooks = opts.hooks;
  const m = opts.models ?? {};
  switch (provider) {
    case "ollama":
      // Keyless by design (local server / user's own box). A key still rides
      // along when set — authenticated proxies in front of Ollama exist.
      return new OpenAICompatibleProvider({
        name: "ollama",
        baseUrl: normalizeOllamaUrl(opts.baseUrl ?? env("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1"),
        apiKey: apiKey ?? env("OLLAMA_API_KEY"),
        keyless: true,
        hooks,
        models: {
          extract: m.extract ?? env("OLLAMA_EXTRACT_MODEL") ?? "llama3.1",
          escalate: m.escalate ?? env("OLLAMA_ESCALATE_MODEL") ?? m.extract ?? env("OLLAMA_EXTRACT_MODEL") ?? "llama3.1",
          vision: m.vision ?? env("OLLAMA_VISION_MODEL") ?? "llava",
        },
      });
    case "openai":
      return new OpenAICompatibleProvider({
        name: "openai",
        baseUrl: env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
        apiKey: apiKey ?? env("OPENAI_API_KEY"),
        hooks,
        models: {
          extract: m.extract ?? env("OPENAI_EXTRACT_MODEL") ?? "gpt-4o-mini",
          escalate: m.escalate ?? env("OPENAI_ESCALATE_MODEL") ?? "gpt-4.1",
          vision: m.vision ?? env("OPENAI_VISION_MODEL") ?? env("OPENAI_EXTRACT_MODEL") ?? "gpt-4o-mini",
        },
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: apiKey ?? env("ANTHROPIC_API_KEY"),
        // Override for mocks/proxies — E2E drives the REAL provider code
        // against a mock Anthropic server, same pattern as *_BASE_URL above.
        baseUrl: env("ANTHROPIC_BASE_URL"),
        hooks,
        models: {
          extract: m.extract ?? env("ANTHROPIC_EXTRACT_MODEL") ?? "claude-haiku-4-5",
          escalate: m.escalate ?? env("ANTHROPIC_ESCALATE_MODEL") ?? "claude-sonnet-5",
          vision: m.vision ?? env("ANTHROPIC_VISION_MODEL") ?? env("ANTHROPIC_EXTRACT_MODEL") ?? "claude-haiku-4-5",
        },
      });
    case "openrouter":
    default:
      return new OpenAICompatibleProvider({
        name: "openrouter",
        baseUrl: env("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
        apiKey: apiKey ?? env("OPENROUTER_API_KEY"),
        hooks,
        models: {
          // Free defaults for dev; set env to a paid model for reliability.
          extract: m.extract ?? env("OPENROUTER_EXTRACT_MODEL") ?? "cohere/north-mini-code:free",
          escalate: m.escalate ?? env("OPENROUTER_ESCALATE_MODEL") ?? "cohere/north-mini-code:free",
          // The free default can't see — set OPENROUTER_VISION_MODEL to a
          // vision-capable model or image attachments stay metadata_only.
          vision: m.vision ?? env("OPENROUTER_VISION_MODEL") ?? env("OPENROUTER_EXTRACT_MODEL") ?? "cohere/north-mini-code:free",
        },
        extraHeaders: {
          "HTTP-Referer": env("OPENROUTER_APP_URL") ?? "https://datamodo.dev",
          "X-Title": "datamodo",
        },
      });
  }
}
