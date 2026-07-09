export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Strip ```json fences a model might wrap output in, then JSON.parse; last
 *  resort, grab the outermost {...}. */
export function parseLoose<T>(content: string): T {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("LLM: response was not valid JSON");
  }
}
