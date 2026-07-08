import type { ChatJsonRequest, LlmModels, LlmProvider } from "./types";
import { parseLoose, sleep } from "./util";

export interface AnthropicConfig {
  apiKey: string | undefined;
  models: LlmModels;
  baseUrl?: string;
}

/**
 * Anthropic Messages API provider. Different shape from OpenAI-compatible: the
 * system prompt is a top-level field and the reply is content[].text. JSON is
 * requested via the prompt (Anthropic also supports tool-use for hard structure,
 * which we can add later); parseLoose handles the reply.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly models: LlmModels;
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor(cfg: AnthropicConfig) {
    this.models = cfg.models;
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://api.anthropic.com";
  }

  async chatJSON<T>(req: ChatJsonRequest): Promise<T> {
    if (!this.apiKey) throw new Error("anthropic: API key not set");
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          system: req.system,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0,
          messages: [{ role: "user", content: req.user }],
        }),
      });
      if (res.status === 429 || res.status === 500 || res.status === 529) {
        const retryAfter = Number(res.headers.get("retry-after")) || 3;
        lastErr = `anthropic ${res.status}`;
        await sleep(Math.min(retryAfter, 8) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = await res.json();
      const content: string | undefined = data?.content?.[0]?.text;
      if (!content) throw new Error("anthropic: empty response");
      return parseLoose<T>(content);
    }
    throw new Error(`anthropic: exhausted retries (${lastErr})`);
  }
}
