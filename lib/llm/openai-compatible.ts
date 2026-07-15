import type { ChatJsonRequest, LlmModels, LlmProvider, ProviderHooks, ProviderName } from "./types";
import { parseLoose, sleep } from "./util.ts";

export interface OpenAICompatibleConfig {
  name: ProviderName;
  baseUrl: string; // e.g. https://openrouter.ai/api/v1
  apiKey: string | undefined;
  models: LlmModels;
  extraHeaders?: Record<string, string>;
  /** Keyless servers (Ollama, LocalAI): no key is fine — the auth header is
   *  simply omitted. A key, when given anyway, still rides along (proxies). */
  keyless?: boolean;
  hooks?: ProviderHooks;
}

/**
 * Provider for any OpenAI-compatible /chat/completions endpoint. Used for both
 * OpenRouter and OpenAI — they differ only in base URL, key, headers, models.
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly name: ProviderName;
  readonly models: LlmModels;
  private cfg: OpenAICompatibleConfig;

  constructor(cfg: OpenAICompatibleConfig) {
    this.name = cfg.name;
    this.models = cfg.models;
    this.cfg = cfg;
  }

  async chatJSON<T>(req: ChatJsonRequest): Promise<T> {
    if (!this.cfg.apiKey && !this.cfg.keyless) throw new Error(`${this.name}: API key not set`);

    const call = (withSchema: boolean): Promise<Response> => {
      // Vision: images ride along as data-URI parts of the user message.
      const userContent = req.images?.length
        ? [
            { type: "text", text: req.user },
            ...req.images.map((im) => ({
              type: "image_url",
              image_url: { url: `data:${im.mediaType};base64,${im.dataBase64}` },
            })),
          ]
        : req.user;
      const body: Record<string, unknown> = {
        model: req.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: userContent },
        ],
        temperature: req.temperature ?? 0,
        max_tokens: req.maxTokens ?? 2048,
      };
      // OpenRouter returns the EXACT dollar cost of the call when asked — so
      // BYOK spend is recorded precisely, never estimated, for that provider.
      if (this.name === "openrouter") body.usage = { include: true };
      if (withSchema && req.schema) {
        body.response_format = {
          type: "json_schema",
          json_schema: { name: req.schemaName ?? "result", strict: false, schema: req.schema },
        };
      }
      return fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
          "content-type": "application/json",
          ...(this.cfg.extraHeaders ?? {}),
        },
        body: JSON.stringify(body),
      });
    };

    let withSchema = req.structured ?? false;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await call(withSchema);
      if ((res.status === 400 || res.status === 404 || res.status === 422) && withSchema) {
        withSchema = false;
        continue; // model rejects response_format — drop it
      }
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        const retryAfter = Number(res.headers.get("retry-after")) || 3;
        lastErr = `${this.name} ${res.status}`;
        await sleep(Math.min(retryAfter, 8) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`${this.name} ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = await res.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) {
        if (withSchema) { withSchema = false; lastErr = "empty w/ schema"; continue; }
        throw new Error(`${this.name}: empty response (model reasoning-only or truncated)`);
      }
      this.reportUsage(req.model, data?.usage);
      return parseLoose<T>(content);
    }
    throw new Error(`${this.name}: exhausted retries (${lastErr})`);
  }

  /** Fire the usage hook from a chat/completions `usage` block. Best-effort:
   *  a hook that throws must never fail the LLM call. */
  private reportUsage(model: string, usage: unknown): void {
    const hook = this.cfg.hooks?.onUsage;
    if (!hook || !usage || typeof usage !== "object") return;
    const u = usage as { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    try {
      hook({
        provider: this.name,
        model,
        inputTokens: Math.max(0, Math.round(u.prompt_tokens ?? 0)),
        outputTokens: Math.max(0, Math.round(u.completion_tokens ?? 0)),
        costUsd: typeof u.cost === "number" && Number.isFinite(u.cost) ? u.cost : null,
      });
    } catch {
      /* usage recording is best-effort — never break extraction */
    }
  }
}
