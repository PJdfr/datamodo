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

/** OpenAI's reasoning families (o1/o3/o4…, gpt-5*) accept only default
 *  sampling — `temperature: 0` is a 400 — and take `max_completion_tokens`
 *  instead of `max_tokens`. Only the REAL OpenAI API enforces this: OpenRouter
 *  normalizes params per model, and Ollama-style servers take the classic
 *  shape for everything. Pure — unit-tested. */
export function isOpenAiReasoningModel(name: ProviderName, model: string): boolean {
  if (name !== "openai") return false;
  return /^(o\d(-|$)|gpt-5)/.test(model.trim().toLowerCase());
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

    // JSON-mode ladder, degraded on rejection:
    //  • "schema"      — json_schema, when the caller asked for structured output;
    //  • "json_object" — keyless local servers (Ollama) honor this and it MARKEDLY
    //                    improves JSON validity from small models; json_schema is
    //                    spottier there, so we prefer json_object for them;
    //  • "none"        — no response_format (parseLoose salvages the text).
    // Cloud providers (with a key) are unaffected: they never get "json_object".
    const modes: Array<"schema" | "json_object" | "none"> = [];
    if ((req.structured ?? false) && req.schema) modes.push("schema");
    if (this.cfg.keyless) modes.push("json_object");
    modes.push("none");

    const call = (mode: "schema" | "json_object" | "none"): Promise<Response> => {
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
        // Reasoning models 400 on temperature and renamed the output cap —
        // same failure class as Anthropic's newest gen, so gate it here too.
        ...(isOpenAiReasoningModel(this.name, req.model)
          ? { max_completion_tokens: req.maxTokens ?? 2048 }
          : { temperature: req.temperature ?? 0, max_tokens: req.maxTokens ?? 2048 }),
      };
      // OpenRouter returns the EXACT dollar cost of the call when asked — so
      // BYOK spend is recorded precisely, never estimated, for that provider.
      if (this.name === "openrouter") body.usage = { include: true };
      if (mode === "schema" && req.schema) {
        body.response_format = {
          type: "json_schema",
          json_schema: { name: req.schemaName ?? "result", strict: false, schema: req.schema },
        };
      } else if (mode === "json_object") {
        body.response_format = { type: "json_object" };
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

    let modeIdx = 0;
    let lastErr = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const mode = modes[Math.min(modeIdx, modes.length - 1)];
      const res = await call(mode);
      if ((res.status === 400 || res.status === 404 || res.status === 422) && mode !== "none") {
        modeIdx++; // model rejects this response_format — drop down the ladder
        continue;
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
        if (mode !== "none") { modeIdx++; lastErr = "empty w/ response_format"; continue; }
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
