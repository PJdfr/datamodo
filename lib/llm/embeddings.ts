// Embeddings client — the "universal glue" that lets nodes of different
// shapes (people, documents, concepts…) live in one semantic space. OpenAI-
// compatible /embeddings endpoint; 1536 dims to match entities.embedding
// vector(1536). FAIL-SOFT BY DESIGN: no key / API error → null, and every
// caller degrades to the non-semantic path (trigram blocking, keyword search).
//
// Env: EMBEDDINGS_API_KEY (falls back to OPENAI_API_KEY),
//      EMBEDDINGS_BASE_URL (default https://api.openai.com/v1),
//      EMBEDDINGS_MODEL   (default text-embedding-3-small).

const BASE_URL = () => (process.env.EMBEDDINGS_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const API_KEY = () => process.env.EMBEDDINGS_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = () => process.env.EMBEDDINGS_MODEL?.trim() || "text-embedding-3-small";

export function embeddingsConfigured(): boolean {
  return API_KEY().length > 0;
}

/** Embed a batch of texts. Returns null (never throws) when unconfigured or
 *  on any API failure — callers always have a non-semantic fallback. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  if (!embeddingsConfigured()) return null;
  try {
    const res = await fetch(`${BASE_URL()}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY()}` },
      body: JSON.stringify({ model: MODEL(), input: texts.map((t) => t.slice(0, 8000)) }),
    });
    if (!res.ok) {
      console.error(`[embeddings] ${res.status} ${await res.text().then((t) => t.slice(0, 200)).catch(() => "")}`);
      return null;
    }
    const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
    if (!json.data || json.data.length !== texts.length) return null;
    const out: number[][] = new Array(texts.length);
    for (const d of json.data) out[d.index] = d.embedding;
    return out;
  } catch (e) {
    console.error("[embeddings] request failed", e);
    return null;
  }
}

/** pgvector literal for raw SQL ("[0.1,0.2,…]"). */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
