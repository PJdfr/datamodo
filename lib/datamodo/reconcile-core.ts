import type { Extraction, ExtractedEntity, ExtractedFact } from "./knowledge.ts";
import type { KindDef } from "./ontology.ts";

// Within-extraction reconciliation (pure core, no DB, no LLM): the deterministic
// pass between "what the model said" and "what the vault folds in".
//
// Why it exists: the fold (upsertFact) keys single-valued facts on
// (subject, predicate) alone. When ONE extraction carries several values for the
// same slot — a paper's five authors, a doc's three tags — the naive fold makes
// the last value win, retires the others as fake "supersessions", and files a
// spurious conflict review per extra value. Two values arriving in the SAME
// message are never a change over time; they mean the attribute is a list, or
// the extraction was sloppy. This pass settles that BEFORE anything touches the
// store:
//   - facts referencing unknown/self localIds drop (a hallucinated "e7" used to
//     throw and fail the whole item, burning LLM retries);
//   - exact duplicates collapse (max confidence, first snippet);
//   - the registry's declared cardinality is enforced (fields default "one",
//     relations default "many");
//   - declared-"one" slots with several distinct values keep the most confident
//     value only — one fact, no supersession chain, no junk reviews;
//   - undeclared slots with several distinct values promote to "many" —
//     same-source multiplicity is strong evidence of a list attribute.

// --- Value identity ----------------------------------------------------------

/** Normalized representation of a fact's value, used in claim keys for
 *  multi-valued facts and to compare facts for equality. Shared with the fold
 *  (knowledge.ts) so pre- and post-resolution identity agree. */
export function valueSlot(v: ExtractedFact["value"], resolve: (localId: string) => string): string {
  switch (v.kind) {
    case "text":
      return "t:" + v.text.trim().toLowerCase();
    case "number":
      return "n:" + v.num + (v.unit ? ":" + v.unit : "");
    case "date":
      return "d:" + v.date;
    case "entity":
      return "e:" + resolve(v.entityLocalId);
  }
}

// --- Declared cardinality (registry semantics) -------------------------------

/** Per-(kind, predicate) cardinality the registry declares. Defaults encode the
 *  product semantics: template FIELDS are single-valued attributes ("one")
 *  unless flagged, template RELATIONS are graph edges and naturally accumulate
 *  ("many") unless flagged. Off-template predicates return null (heuristics
 *  decide). Expects canonicalized kinds/predicates. */
export function declaredCardinality(
  kinds: KindDef[],
  kind: string,
  predicate: string,
): "one" | "many" | null {
  const def = kinds.find((k) => k.kind === kind);
  if (!def) return null;
  const field = def.fields.find((f) => f.key === predicate);
  if (field) return field.cardinality ?? "one";
  const rel = def.relations.find((r) => r.predicate === predicate);
  if (rel) return rel.cardinality ?? "many";
  return null;
}

// --- Loose value rescue ------------------------------------------------------

/** Parse a number the LLM put in valueText instead of valueNumber ("$1,234.56",
 *  "1 200 EUR", "42%"). Conservative: the WHOLE string must be number-shaped —
 *  never grabs a digit out of prose. Null when it isn't one. */
export function parseLooseNumber(text: string): number | null {
  const m = text.trim().match(/^[$€£¥]?\s*(-?[\d\s,]+(?:\.\d+)?)\s*%?\s*(?:[A-Za-z]{1,4})?$/);
  if (!m) return null;
  const num = Number(m[1].replace(/[\s,]/g, ""));
  return Number.isFinite(num) ? num : null;
}

/** Parse a date the LLM put in valueText instead of valueDate ("March 3, 2026",
 *  "2026-01-02T09:00"). Requires an explicit 4-digit year so vague phrases
 *  ("next Tuesday") never sneak through. Returns YYYY-MM-DD or null. */
export function parseLooseDate(text: string): string | null {
  const t = text.trim();
  if (!/\d{4}/.test(t)) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  // ISO-leading strings keep their literal day (JS parses bare YYYY-MM-DD as
  // UTC; local getters would shift it in western timezones). Prose dates parse
  // as local time, so local getters keep THEIR literal day too.
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// --- Natural-key canonicalization -------------------------------------------

/** Phones as dialable digits (leading + kept): "+1 (555) 123-4567" and
 *  "555.123.4567" stop producing different tier-0 keys. Strings that aren't
 *  really phone numbers (< 5 digits) pass through untouched. */
export function normalizePhone(phone: string): string {
  const t = phone.trim();
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length < 5) return t;
  return (t.startsWith("+") ? "+" : "") + digits;
}

/** URLs minus the noise that makes the same page look different: tracking
 *  params (utm_*, fbclid, gclid, mc_*), lowercased scheme+host, no trailing
 *  slash. Unparseable strings pass through trimmed. */
export function normalizeUrl(url: string): string {
  const t = url.trim();
  try {
    const u = new URL(t);
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(k) || /^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src)$/i.test(k)) {
        u.searchParams.delete(k);
      }
    }
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString().replace(/\?$/, "");
  } catch {
    return t;
  }
}

/** Canonicalize an entity's strong identifiers so the SAME real-world key
 *  always lands on the same normalized_key: emails lowercase, phones
 *  digits-only, URLs de-tracked, everything trimmed. */
export function canonicalizeNaturalKeys(
  keys: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!keys) return keys;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(keys)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (k === "email") out[k] = v.trim().toLowerCase();
    else if (k === "phone") out[k] = normalizePhone(v);
    else if (k === "url") out[k] = normalizeUrl(v);
    else out[k] = v.trim();
  }
  return out;
}

/** Date values canonical as YYYY-MM-DD: pads "2026-1-2", rescues parseable
 *  prose, returns null for garbage (the fact drops rather than storing an
 *  uncomparable date). */
export function canonicalDateValue(date: string): string | null {
  const m = date.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return parseLooseDate(date);
}

/** Unit spellings the models actually produce, mapped to one canonical form —
 *  "$100" and "100 USD" must land in the same value slot, not dodge dedup. */
const UNIT_SYNONYMS: Record<string, string> = {
  $: "USD", "us$": "USD", usd: "USD", dollar: "USD", dollars: "USD",
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP",
  "¥": "JPY", jpy: "JPY", yen: "JPY",
  percent: "%", pct: "%", "%": "%",
};

/** Canonical unit: currency synonyms collapse, bare 3-letter codes uppercase
 *  ("eur" → "EUR"), anything else (kg, bytes, pages…) passes through trimmed. */
export function normalizeUnit(unit: string): string | undefined {
  const t = unit.trim();
  if (!t) return undefined;
  const hit = UNIT_SYNONYMS[t.toLowerCase()];
  if (hit) return hit;
  return /^[a-z]{3}$/i.test(t) ? t.toUpperCase() : t;
}

/** Fold one word's simple English plural ("strategies" → "strategy",
 *  "boxes" → "box", "notes" → "note") — never on -ss/-us/-is words. Shared
 *  shape with the agent router's term folding. */
export function foldPluralWord(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && /(?:s|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !/(?:ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

/** Fold a CONCEPT's normalized label key so singular/plural topics collapse
 *  onto one node ("marketing strategies" ≡ "marketing strategy"). Last word
 *  only — that's where English pluralizes noun phrases. */
export function foldConceptKey(normalizedLabel: string): string {
  const words = normalizedLabel.split(" ");
  words[words.length - 1] = foldPluralWord(words[words.length - 1]);
  return words.join(" ");
}

// --- Sender identity ---------------------------------------------------------

/** Parse a channel sender handle: `Name <email>` / `"Name" <email>` / bare
 *  email. Null fields when absent. */
export function parseSender(sender: string): { name: string | null; email: string | null } {
  const angled = sender.match(/^\s*"?([^"<]*?)"?\s*<([^\s@>]+@[^\s@>]+)>\s*$/);
  if (angled) return { name: angled[1].trim() || null, email: angled[2].toLowerCase() };
  const bare = sender.trim();
  if (/^[^\s@]+@[^\s@]+$/.test(bare)) return { name: null, email: bare.toLowerCase() };
  return { name: bare || null, email: null };
}

const normLabel = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Attach the message sender's email to the person entity that IS the sender —
 * the extraction says "Bob Smith" and the envelope says `Bob Smith
 * <bob@acme.com>`; joining them gives resolution a free tier-0 key, so Bob's
 * next message lands on the same record without trigram or adjudication.
 * Conservative: exact normalized-name match, person kind only, never
 * overwrites an existing email, and skips when another entity in the
 * extraction already carries that email. Pure.
 */
export function enrichSenderIdentity(extraction: Extraction, sender: string | null | undefined): Extraction {
  if (!sender) return extraction;
  const { name, email } = parseSender(sender);
  if (!email || !name) return extraction;
  if (extraction.entities.some((e) => e.naturalKeys?.email?.toLowerCase() === email)) return extraction;
  const target = normLabel(name);
  if (!target) return extraction;
  let applied = false;
  const entities = extraction.entities.map((e) => {
    if (applied || e.kind !== "person" || e.naturalKeys?.email || normLabel(e.label) !== target) return e;
    applied = true;
    return { ...e, naturalKeys: { ...(e.naturalKeys ?? {}), email } };
  });
  return applied ? { entities, facts: extraction.facts } : extraction;
}

// --- Evidence grounding ------------------------------------------------------

/** Below this many digits a number is too common to test for presence. */
const GROUND_MIN_DIGITS = 3;
/** Snippets shorter than this match trivially — not worth testing. */
const GROUND_MIN_SNIPPET = 6;
/** Confidence ceiling for a fact whose evidence isn't in the source. */
export const UNGROUNDED_CONFIDENCE_CAP = 0.35;

export interface GroundingResult {
  extraction: Extraction;
  /** Facts whose claimed evidence (snippet or number) is absent from the source. */
  ungrounded: number;
}

/**
 * Zero-LLM hallucination guard: verify each fact's claimed evidence against
 * the text the model actually read. A quoted snippet that appears nowhere, or
 * a number (≥3 digits) that never occurs in the source's digit stream, caps
 * that fact's confidence at UNGROUNDED_CONFIDENCE_CAP — pushing it toward the
 * review gate instead of filing silently. Absent evidence is never penalized
 * (no snippet ≠ ungrounded); false positives are impossible by construction
 * (presence always passes). Pure.
 */
export function groundExtractionEvidence(extraction: Extraction, sourceText: string): GroundingResult {
  const normText = sourceText.toLowerCase().replace(/\s+/g, " ");
  // Digit stream: separators stripped on BOTH sides, so "1,234.56" ⊇ 123456.
  const digitStream = sourceText.replace(/[\s,.'’ ]/g, "");
  let ungrounded = 0;
  const facts = extraction.facts.map((f) => {
    let miss = false;
    if (f.snippet) {
      const s = f.snippet.toLowerCase().replace(/\s+/g, " ").replace(/^["'“”…\s]+|["'“”…\s]+$/g, "");
      if (s.length >= GROUND_MIN_SNIPPET && !normText.includes(s)) miss = true;
    }
    if (f.value.kind === "number") {
      const digits = String(Math.abs(f.value.num)).replace(/\./g, "");
      if (digits.length >= GROUND_MIN_DIGITS && !digitStream.includes(digits)) miss = true;
    }
    if (!miss) return f;
    ungrounded++;
    return { ...f, confidence: Math.min(conf(f), UNGROUNDED_CONFIDENCE_CAP) };
  });
  return { extraction: { entities: extraction.entities, facts }, ungrounded };
}

// --- Reconciliation ----------------------------------------------------------

export interface ReconcileStats {
  /** Facts whose subject/object localId matched no extracted entity. */
  droppedUnknownRef: number;
  /** Entity-valued facts pointing at their own subject. */
  droppedSelfRef: number;
  /** Identical (subject, predicate, value) repeats collapsed into one. */
  mergedDuplicates: number;
  /** Facts flipped "one" → "many" (declared list, or same-source multiplicity). */
  promotedToMany: number;
  /** Extra values dropped on declared-"one" slots (kept the most confident). */
  conflictsResolved: number;
  /** Facts with unusable values (blank text, NaN numbers, garbage dates). */
  droppedEmpty: number;
}

export interface ReconcileResult {
  extraction: Extraction;
  stats: ReconcileStats;
}

const conf = (f: ExtractedFact): number => (typeof f.confidence === "number" ? f.confidence : 1);

/** Predicates whose text values are URLs — normalized so the same page dedups. */
const URL_PREDICATES = new Set(["url", "website", "link"]);

/** Normalize one fact's value for storage/comparison. Returns the (possibly
 *  same) value, or null when the value is unusable and the fact should drop. */
function normalizeFactValue(f: ExtractedFact): ExtractedFact["value"] | null {
  const v = f.value;
  if (v.kind === "text") {
    const t = v.text.trim();
    if (!t) return null;
    const text = URL_PREDICATES.has(f.predicate) ? normalizeUrl(t) : t;
    return text === v.text ? v : { kind: "text", text };
  }
  if (v.kind === "number") {
    if (!Number.isFinite(v.num)) return null;
    const unit = v.unit ? normalizeUnit(v.unit) : undefined;
    return unit === v.unit ? v : { kind: "number", num: v.num, unit };
  }
  if (v.kind === "date") {
    const date = canonicalDateValue(v.date);
    if (!date) return null;
    return date === v.date ? v : { kind: "date", date };
  }
  return v;
}

/**
 * Reconcile one extraction before ingest. Pure; returns a new Extraction.
 * `kinds` (the org registry, canonicalized vocabulary) supplies declared
 * cardinality — pass [] to run on heuristics alone.
 */
export function reconcileExtraction(extraction: Extraction, kinds: KindDef[] = []): ReconcileResult {
  const stats: ReconcileStats = {
    droppedUnknownRef: 0,
    droppedSelfRef: 0,
    mergedDuplicates: 0,
    promotedToMany: 0,
    conflictsResolved: 0,
    droppedEmpty: 0,
  };

  // Entities: usable labels only, one entity per localId (first wins — facts
  // referencing the localId should mean the first definition, not the last),
  // strong identifiers canonicalized (same email/phone/url → same tier-0 key).
  const seenLocal = new Set<string>();
  const entities: ExtractedEntity[] = [];
  for (const e of extraction.entities) {
    const label = e.label?.trim();
    if (!e.localId || !label || seenLocal.has(e.localId)) continue;
    seenLocal.add(e.localId);
    entities.push({ ...e, label, naturalKeys: canonicalizeNaturalKeys(e.naturalKeys) });
  }
  const kindByLocal = new Map(entities.map((e) => [e.localId, e.kind]));

  // Facts: drop broken references (they used to throw and fail the whole item)
  // and normalize values so equal values COMPARE equal (dates padded to
  // YYYY-MM-DD, text trimmed, URLs de-tracked, NaN/blank dropped).
  const referenced: ExtractedFact[] = [];
  for (const f of extraction.facts) {
    if (!kindByLocal.has(f.subjectLocalId)) {
      stats.droppedUnknownRef++;
      continue;
    }
    if (f.value.kind === "entity") {
      if (!kindByLocal.has(f.value.entityLocalId)) {
        stats.droppedUnknownRef++;
        continue;
      }
      if (f.value.entityLocalId === f.subjectLocalId) {
        stats.droppedSelfRef++;
        continue;
      }
    }
    const v = normalizeFactValue(f);
    if (v === null) {
      stats.droppedEmpty++;
      continue;
    }
    referenced.push(v === f.value ? f : { ...f, value: v });
  }

  // Group by slot identity (subject, predicate); localId stands in for the
  // canonical entity id pre-resolution.
  const groups = new Map<string, ExtractedFact[]>();
  const order: string[] = [];
  for (const f of referenced) {
    const key = `${f.subjectLocalId} ${f.predicate}`;
    const g = groups.get(key);
    if (g) g.push(f);
    else {
      groups.set(key, [f]);
      order.push(key);
    }
  }

  const facts: ExtractedFact[] = [];
  for (const key of order) {
    const group = groups.get(key)!;

    // Collapse exact value repeats: max confidence, first snippet kept.
    const bySlot = new Map<string, ExtractedFact>();
    for (const f of group) {
      const slot = valueSlot(f.value, (id) => id);
      const prev = bySlot.get(slot);
      if (!prev) {
        bySlot.set(slot, f);
        continue;
      }
      stats.mergedDuplicates++;
      bySlot.set(slot, {
        ...prev,
        cardinality: prev.cardinality === "many" || f.cardinality === "many" ? "many" : prev.cardinality,
        confidence: Math.max(conf(prev), conf(f)),
        snippet: prev.snippet ?? f.snippet,
      });
    }
    let distinct = [...bySlot.values()];

    const subjKind = kindByLocal.get(group[0].subjectLocalId)!;
    const declared = declaredCardinality(kinds, subjKind, group[0].predicate);
    const wantsMany = distinct.some((f) => f.cardinality === "many");

    if (declared === "one") {
      // Single-valued by contract: several distinct values in one message is an
      // extraction error, not a supersession — keep the most confident value.
      if (distinct.length > 1) {
        distinct.sort((a, b) => conf(b) - conf(a));
        stats.conflictsResolved += distinct.length - 1;
        distinct = [distinct[0]];
      }
      if (distinct[0].cardinality === "many") distinct[0] = { ...distinct[0], cardinality: "one" };
    } else if (declared === "many" || wantsMany || distinct.length > 1) {
      // A declared list, a model-flagged list, or same-source multiplicity:
      // every value coexists as its own fact.
      for (let i = 0; i < distinct.length; i++) {
        if (distinct[i].cardinality !== "many") {
          stats.promotedToMany++;
          distinct[i] = { ...distinct[i], cardinality: "many" };
        }
      }
    }
    facts.push(...distinct);
  }

  return { extraction: { entities, facts }, stats };
}
