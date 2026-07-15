import type { ChatJsonRequest, LlmModels, LlmProvider, ProviderHooks } from "./types";
import { parseLoose, sleep } from "./util.ts";

export interface AnthropicConfig {
  apiKey: string | undefined;
  models: LlmModels;
  baseUrl?: string;
  hooks?: ProviderHooks;
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
  private hooks?: ProviderHooks;

  constructor(cfg: AnthropicConfig) {
    this.models = cfg.models;
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://api.anthropic.com";
    this.hooks = cfg.hooks;
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
          // Vision: image blocks precede the text (Anthropic's recommended order).
          messages: [
            {
              role: "user",
              content: req.images?.length
                ? [
                    ...req.images.map((im) => ({
                      type: "image",
                      source: { type: "base64", media_type: im.mediaType, data: im.dataBase64 },
                    })),
                    { type: "text", text: req.user },
                  ]
                : req.user,
            },
          ],
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
      // Usage: Anthropic returns input_tokens/output_tokens (no cost) — the
      // recorder prices them. Best-effort; a throwing hook never fails the call.
      const usage = data?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      if (this.hooks?.onUsage && usage) {
        try {
          this.hooks.onUsage({
            provider: "anthropic",
            model: req.model,
            inputTokens: Math.max(0, Math.round(usage.input_tokens ?? 0)),
            outputTokens: Math.max(0, Math.round(usage.output_tokens ?? 0)),
            costUsd: null,
          });
        } catch { /* best-effort */ }
      }
      return parseLoose<T>(content);
    }
    throw new Error(`anthropic: exhausted retries (${lastErr})`);
  }
}
