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

/** Whether a Claude model still ACCEPTS sampling params (`temperature`).
 *  Anthropic REMOVED temperature/top_p/top_k on the newest generations —
 *  Sonnet 5, Opus 4.7/4.8, Fable/Mythos 5 — where sending one returns a 400
 *  ("temperature is not supported/deprecated for this model"). This is an
 *  ALLOWLIST of families known to accept it: wrongly omitting is harmless
 *  (the model just uses its default), wrongly sending breaks the call.
 *  Pure — unit-tested. */
export function anthropicAcceptsSampling(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (/^claude-(2|3)([.-]|$)/.test(m)) return true;           // claude-2.x, claude-3[-5]-…
  if (/^claude-haiku-/.test(m)) return true;                  // haiku 4.5 keeps sampling
  // opus/sonnet 4.0 – 4.6 (incl. dated ids like claude-sonnet-4-5-20250929);
  // 4.7+ and 5+ reject.
  if (/^claude-(opus|sonnet)-4(-[0-6](-|$)|$)/.test(m)) return true;
  return false;
}

/** Models where thinking is ALWAYS ON and any `thinking` config other than
 *  adaptive is rejected — never send `{type:"disabled"}` to these. */
export function anthropicAlwaysThinks(model: string): boolean {
  return /^claude-(fable|mythos)-/.test(model.trim().toLowerCase());
}

/** The request body for one chatJSON call — split out so the sampling-param
 *  rule above is testable without a network. */
export function buildAnthropicBody(req: ChatJsonRequest): Record<string, unknown> {
  const acceptsSampling = anthropicAcceptsSampling(req.model);
  return {
    model: req.model,
    system: req.system,
    max_tokens: req.maxTokens ?? 2048,
    // Newest models (Sonnet 5 / Opus 4.7+ / Fable 5) reject temperature — omit it there.
    ...(acceptsSampling ? { temperature: req.temperature ?? 0 } : {}),
    // Those same models run ADAPTIVE THINKING when `thinking` is omitted;
    // thinking tokens count against max_tokens and prepend thinking blocks to
    // the reply. Our chatJSON calls are structured JSON extraction (formerly
    // temperature-0), so turn thinking off — except on families where thinking
    // is always-on and a "disabled" config is itself a 400.
    ...(!acceptsSampling && !anthropicAlwaysThinks(req.model)
      ? { thinking: { type: "disabled" } }
      : {}),
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
  };
}

/** Pull the reply text out of a Messages API response. The content array can
 *  lead with `thinking` blocks (models with thinking on return them BEFORE the
 *  text; with the default display they even have empty text) — so scan for
 *  `text` blocks instead of trusting content[0]. Pure — unit-tested. */
export function extractAnthropicText(data: unknown): string {
  const blocks = (data as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}
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
        body: JSON.stringify(buildAnthropicBody(req)),
      });
      if (res.status === 429 || res.status === 500 || res.status === 529) {
        const retryAfter = Number(res.headers.get("retry-after")) || 3;
        lastErr = `anthropic ${res.status}`;
        await sleep(Math.min(retryAfter, 8) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = await res.json();
      const content = extractAnthropicText(data);
      if (!content) {
        const stop = data?.stop_reason as string | undefined;
        throw new Error(
          stop === "max_tokens"
            ? "anthropic: output budget spent before any text (raise maxTokens)"
            : `anthropic: empty response${stop ? ` (stop_reason ${stop})` : ""}`,
        );
      }
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
