// Provider-agnostic LLM interface. Datamodo talks to SOME OpenAI-shaped model
// server — OpenRouter, OpenAI, Anthropic, or a keyless Ollama — so all call
// sites depend on this interface, never a concrete provider. Pick one with
// getLlmProvider() (see ./index.ts); the `provider` arg / LLM_PROVIDER env
// routes to the impl.

export type ProviderName = "openrouter" | "openai" | "anthropic" | "ollama";

/** One image attached to a chat request (the vision tier). */
export interface ChatImage {
  /** image/png | image/jpeg | image/webp | image/gif */
  mediaType: string;
  /** Raw image bytes, base64-encoded — no data: prefix. */
  dataBase64: string;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  model: string;
  /** Images for vision-capable models. A non-vision model errors on these —
   *  callers treat that like any other LLM failure (degrade, don't crash). */
  images?: ChatImage[];
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
  /** Vision-capable model for image understanding. Defaults to `extract` —
   *  override via env when the workhorse can't see (a blind model just errors
   *  and the caller degrades to metadata_only). */
  vision: string;
}

/** Token usage + cost of ONE completed call — surfaced via `onUsage` so BYOK
 *  spend can be recorded. `costUsd` is the provider's EXACT number when it
 *  returns one (OpenRouter), else null (the recorder prices it from the token
 *  counts). Fail-soft: a call with no usage block simply doesn't fire. */
export interface LlmUsage {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Provider-reported cost in USD, when available (OpenRouter). */
  costUsd: number | null;
}

/** Optional wiring passed to a provider so each call reports its usage. */
export interface ProviderHooks {
  onUsage?: (u: LlmUsage) => void;
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly models: LlmModels;
  /** Send a chat request and parse the reply as JSON of type T. */
  chatJSON<T>(req: ChatJsonRequest): Promise<T>;
}
