// LLM COST — pricing token usage for the user's OWN provider spend (BYOK).
// This is NOT datamodo's subscription billing; it's "what your Anthropic /
// OpenAI / OpenRouter key cost you" while datamodo used it on your behalf.
//
// OpenRouter returns the real cost per call (we ask for it), so for that
// provider we NEVER estimate — the ledger stores the exact number. Anthropic
// and OpenAI don't return cost, so we price their token counts from this
// table (public list prices; ESTIMATES — they change and vary by tier). An
// unknown model prices to null: the UI shows the tokens but no dollar figure
// rather than a wrong one. Pure module — unit-tested.

/** USD per 1,000,000 tokens, {input, output}. Prefix-matched so a dated model
 *  id ("claude-haiku-4-5-20251001") hits its family ("claude-haiku-4-5").
 *  Ordered longest-prefix-first within each provider so specific beats general.
 *  Public list prices as of 2026-07; update when they move. */
export const PRICE_DATE = "2026-07";

interface Price {
  prefix: string;
  inPerM: number;
  outPerM: number;
}

// Sorted longest-first so "claude-opus-4-8" matches before "claude-opus".
const PRICES: Price[] = [
  // Anthropic
  { prefix: "claude-opus-4", inPerM: 15, outPerM: 75 },
  { prefix: "claude-sonnet-5", inPerM: 3, outPerM: 15 },
  { prefix: "claude-sonnet-4", inPerM: 3, outPerM: 15 },
  { prefix: "claude-haiku-4-5", inPerM: 1, outPerM: 5 },
  { prefix: "claude-3-5-haiku", inPerM: 0.8, outPerM: 4 },
  { prefix: "claude-3-5-sonnet", inPerM: 3, outPerM: 15 },
  { prefix: "claude-opus", inPerM: 15, outPerM: 75 },
  { prefix: "claude-sonnet", inPerM: 3, outPerM: 15 },
  { prefix: "claude-haiku", inPerM: 1, outPerM: 5 },
  // OpenAI (chat)
  { prefix: "gpt-4o-mini", inPerM: 0.15, outPerM: 0.6 },
  { prefix: "gpt-4.1-mini", inPerM: 0.4, outPerM: 1.6 },
  { prefix: "gpt-4.1-nano", inPerM: 0.1, outPerM: 0.4 },
  { prefix: "gpt-4.1", inPerM: 2, outPerM: 8 },
  { prefix: "gpt-4o", inPerM: 2.5, outPerM: 10 },
  // OpenAI (embeddings — input only; output tokens are 0)
  { prefix: "text-embedding-3-small", inPerM: 0.02, outPerM: 0 },
  { prefix: "text-embedding-3-large", inPerM: 0.13, outPerM: 0 },
].sort((a, b) => b.prefix.length - a.prefix.length);

/** The price row for a model id, or null when we don't know it. */
export function priceFor(model: string): Price | null {
  const m = model.trim().toLowerCase();
  return PRICES.find((p) => m.startsWith(p.prefix)) ?? null;
}

/**
 * Estimate the USD cost of one call from its token counts. Returns null for
 * an unknown model (the caller shows tokens without a dollar figure) — never a
 * guessed number. Ollama (local) is free: any "ollama"-ish model prices to 0.
 */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = priceFor(model);
  if (!p) return null;
  const cost = (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
  // Round to 6 decimals (µ-dollars) — sub-cent calls still accumulate.
  return Math.round(cost * 1e6) / 1e6;
}

/** Whether we can put a dollar figure on this model at all. */
export function isPriced(model: string): boolean {
  return priceFor(model) !== null;
}
