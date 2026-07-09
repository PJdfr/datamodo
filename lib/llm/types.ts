// Provider-agnostic LLM interface. Datamodo always talks to SOME hosted model
// via an API key — OpenRouter, OpenAI, or Anthropic — so all call sites depend
// on this interface, never a concrete provider. Pick one with getLlmProvider()
// (see ./index.ts); the `provider` arg / LLM_PROVIDER env routes to the impl.

export type ProviderName = "openrouter" | "openai" | "anthropic";

export interface ChatJsonRequest {
  system: string;
  user: string;
  model: string;
  /** JSON Schema for provider-native structured output (only sent when `structured`). */
  schema?: Record<string, unknown>;
  schemaName?: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask for provider-native structured output. Off by default — many models
   *  (esp. free ones) return empty with it; the prompt demands JSON regardless. */
  structured?: boolean;
}

export interface LlmModels {
  /** Cheap workhorse. */
  extract: string;
  /** Stronger model for low-confidence escalation. */
  escalate: string;
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly models: LlmModels;
  /** Send a chat request and parse the reply as JSON of type T. */
  chatJSON<T>(req: ChatJsonRequest): Promise<T>;
}
