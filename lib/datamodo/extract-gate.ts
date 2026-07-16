// TRIVIALITY GATE (efficiency track, 2026-07-16) — the cheapest LLM call is
// the one never made. A large share of chat traffic is acknowledgements
// ("ok", "thanks 👍", "ça marche") that can never yield a fact; today each
// one costs an extraction call + a priming embedding. This pure gate skips
// them DETERMINISTICALLY and conservatively: anything with attachments, a
// note-marker subject, real length, or a single informative signal (digit,
// currency, URL, email, @mention) goes through — only unmistakable acks and
// empty/emoji-only messages are skipped. False positives (extracting a
// trivial message) cost cents; false negatives (skipping a real one) cost
// knowledge — so every rule errs toward extracting.

/** Tokens that make up pure acknowledgements (en/fr — the user base). */
const ACK_TOKENS = new Set([
  // english
  "ok", "okay", "okey", "k", "kk", "yes", "yep", "yeah", "no", "nope", "sure",
  "thanks", "thank", "thankyou", "you", "thx", "ty", "cool", "great", "nice",
  "perfect", "awesome", "noted", "got", "it", "gotit", "done", "good", "fine",
  "lol", "haha", "hey", "hi", "hello", "morning", "night", "bye", "cheers",
  "sounds", "will", "do",
  // french
  "oui", "non", "merci", "super", "parfait", "nickel", "top", "genial",
  "daccord", "dac", "dacc", "ca", "marche", "bien", "recu", "vu", "compris",
  "entendu", "salut", "bonjour", "bonsoir", "allez", "go", "voila", "cest",
  "note", "impeccable",
]);

/** Anything that smells like information: numbers, money, dates, links,
 *  emails, handles, question marks (questions deserve an answer/extraction). */
const INFO_SIGNAL = /[0-9€$£%#@?]|https?:\/\/|www\./;

const MAX_TRIVIAL_CHARS = 80;
const MAX_TRIVIAL_TOKENS = 6;

export interface GateInput {
  text: string;
  subject?: string | null;
  hasAttachments?: boolean;
}

/** True when the message deserves the extraction pipeline; false only for
 *  unmistakable acks / empty payloads. Pure — unit-tested. */
export function worthExtracting(input: GateInput): boolean {
  if (input.hasAttachments) return true;
  // The explicit note gesture always extracts (it forces the note object).
  if (input.subject && /^(note|notes|memo)\b/i.test(input.subject.trim())) return true;
  const combined = `${input.subject ?? ""}\n${input.text ?? ""}`.trim();
  if (!combined) return false; // nothing at all
  if (combined.length > MAX_TRIVIAL_CHARS) return true;
  if (INFO_SIGNAL.test(combined)) return true;

  // Strip accents + everything non-alphabetic; what remains must be a short
  // string of known ack tokens (or nothing at all — emoji/punctuation only).
  const tokens = combined
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false; // emoji/punctuation only
  if (tokens.length > MAX_TRIVIAL_TOKENS) return true;
  return !tokens.every((t) => ACK_TOKENS.has(t));
}
