// Transcription client — the audio tier's ear. OpenAI-compatible
// /audio/transcriptions endpoint (multipart), so any Whisper-shaped service
// works. FAIL-SOFT BY DESIGN (same contract as embeddings.ts): no key / API
// error → null, and the caller degrades the attachment to metadata_only —
// an audio failure never fails the item.
//
// Env: TRANSCRIPTION_API_KEY (falls back to OPENAI_API_KEY),
//      TRANSCRIPTION_BASE_URL (default https://api.openai.com/v1),
//      TRANSCRIPTION_MODEL   (default whisper-1).
// KEYLESS servers (a local whisper server): a custom TRANSCRIPTION_BASE_URL
// counts as configured even without a key — the auth header is omitted.

const BASE_URL = () => (process.env.TRANSCRIPTION_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const API_KEY = () => process.env.TRANSCRIPTION_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = () => process.env.TRANSCRIPTION_MODEL?.trim() || "whisper-1";

export function transcriptionConfigured(): boolean {
  return API_KEY().length > 0 || Boolean(process.env.TRANSCRIPTION_BASE_URL?.trim());
}

/** Transcribe one audio attachment. Returns the transcript text, or null
 *  (never throws) when unconfigured, on any API failure, or when the model
 *  hears nothing worth returning. */
export async function transcribeAudio(args: {
  bytes: Uint8Array;
  mediaType: string;
  filename?: string | null;
}): Promise<string | null> {
  if (!transcriptionConfigured()) return null;
  try {
    const form = new FormData();
    // A filename with a recognizable extension helps the API pick a decoder.
    const name = args.filename?.trim() || `audio.${args.mediaType.split("/")[1] ?? "mp3"}`;
    form.append("file", new Blob([new Uint8Array(args.bytes)], { type: args.mediaType }), name);
    form.append("model", MODEL());
    form.append("response_format", "json");
    const key = API_KEY();
    const res = await fetch(`${BASE_URL()}/audio/transcriptions`, {
      method: "POST",
      headers: key ? { authorization: `Bearer ${key}` } : {},
      body: form,
    });
    if (!res.ok) {
      console.error(`[transcription] ${res.status} ${await res.text().then((t) => t.slice(0, 200)).catch(() => "")}`);
      return null;
    }
    const json = (await res.json()) as { text?: string };
    const text = typeof json.text === "string" ? json.text.trim() : "";
    return text || null;
  } catch (e) {
    console.error("[transcription] request failed", e);
    return null;
  }
}
