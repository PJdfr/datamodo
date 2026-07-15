export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse JSON out of an LLM response that may be imperfect — especially from
 * local models (Ollama). Handles, in order: a clean parse; a ```json fence;
 * leading/trailing prose around the JSON; arrays as well as objects; and
 * trailing commas. Extraction is BALANCED (respects strings/escapes) so it
 * grabs the first complete value rather than greedily spanning to the last
 * brace. Throws with a snippet of the raw content so failures are diagnosable.
 */
export function parseLoose<T>(content: string): T {
  for (const candidate of jsonCandidates(content)) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(`LLM: response was not valid JSON — got: ${content.trim().slice(0, 200)}`);
}

/** Ordered list of things to try JSON.parse on, most-likely first. */
function jsonCandidates(raw: string): string[] {
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    if (s && !out.includes(s)) out.push(s);
  };

  let s = raw.trim();
  // Unwrap a ```json … ``` (or bare ```) fence if the whole thing is fenced or
  // the model wrapped the JSON in one.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();

  push(s);
  push(stripTrailingCommas(s));

  // The first balanced object/array, in case there's prose around it.
  const balanced = extractBalanced(s);
  push(balanced);
  push(stripTrailingCommas(balanced));

  return out;
}

/** Remove trailing commas before a closing } or ] (a common local-model slip). */
function stripTrailingCommas(s: string | null): string | null {
  return s ? s.replace(/,(\s*[}\]])/g, "$1") : null;
}

/** The first balanced {…} or […] value, respecting strings and escapes, or
 *  null if there isn't one. Beats a greedy `/\{[\s\S]*\}/` which over-matches
 *  when the model appends prose (or emits two objects). */
function extractBalanced(s: string): string | null {
  const start = s.search(/[{[]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}
