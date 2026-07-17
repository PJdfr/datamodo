import { prisma } from "@/lib/prisma";
import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import { llmForUser } from "./llm-for-user";
import { readBlob } from "@/lib/ingest/store";
import { ingestExtraction, createExtractionReview, normalizeKey, type Extraction, type ExtractedFact } from "@/lib/datamodo/knowledge";
import { buildNoteExtraction, NOTE_KIND, type GeneratedNote } from "@/lib/datamodo/document-extraction";
import { getOnboardingContext } from "@/lib/datamodo/settings";
import { renderKnownBlock } from "./priming-core.ts";
import {
  buildClassifyPrompt,
  buildDocumentPrompt,
  buildImagePrompt,
  buildOffTemplateReview,
  canonicalizeExtraction,
  promptCategories,
  restrictExtractionToTemplates,
  slugify,
  type DocumentPromptInput,
  type KindDef,
  type OffTemplateReviewPayload,
} from "@/lib/datamodo/ontology";

// LLM extraction: one message → structured entities + facts (the ⑤ step).
// Small-model-first with a confidence-gated escalation. Produces the same
// `Extraction` contract the knowledge layer already consumes, so nothing
// downstream changes. Provider is OpenRouter (see lib/llm/openrouter.ts).

// --- LLM-facing shape (flat; unions/oneOf are poorly supported by models) ----

interface LlmEntity {
  localId: string;
  kind: string;
  label: string;
  email?: string;
  phone?: string;
  invoiceNo?: string;
}
interface LlmFact {
  subjectLocalId: string;
  predicate: string;
  cardinality?: "one" | "many";
  valueType: "text" | "number" | "date" | "entity";
  valueText?: string;
  valueNumber?: number;
  valueDate?: string; // ISO yyyy-mm-dd
  valueEntityLocalId?: string;
  unit?: string;
  confidence?: number;
  snippet?: string;
}
interface LlmExtraction {
  entities: LlmEntity[];
  facts: LlmFact[];
  overallConfidence?: number;
  /** Document mode only: a compact markdown summary — the thick node's body. */
  summary?: string;
  /** Message mode only: when the message is a substantive write-up the user
   *  dumped (braindump, meeting notes, plan), the distilled note WE author. */
  note?: { title?: string; body?: string } | null;
}

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          localId: { type: "string" },
          kind: { type: "string" },
          label: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          invoiceNo: { type: "string" },
        },
        required: ["localId", "kind", "label"],
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subjectLocalId: { type: "string" },
          predicate: { type: "string" },
          cardinality: { type: "string", enum: ["one", "many"] },
          valueType: { type: "string", enum: ["text", "number", "date", "entity"] },
          valueText: { type: "string" },
          valueNumber: { type: "number" },
          valueDate: { type: "string" },
          valueEntityLocalId: { type: "string" },
          unit: { type: "string" },
          confidence: { type: "number" },
          snippet: { type: "string" },
        },
        required: ["subjectLocalId", "predicate", "valueType"],
      },
    },
    overallConfidence: { type: "number" },
    note: {
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
    },
  },
  required: ["entities", "facts"],
};

const DOC_RESPONSE_SCHEMA: Record<string, unknown> = {
  ...RESPONSE_SCHEMA,
  properties: {
    ...(RESPONSE_SCHEMA.properties as Record<string, unknown>),
    summary: { type: "string" },
  },
  required: ["entities", "facts", "summary"],
};

const SYSTEM = `You extract structured facts from a SINGLE communication (an email or chat message) for a personal data assistant.

Rules:
- Return ONLY facts supported by the text. Never invent data.
- Model real-world things as ENTITIES (person, org, invoice, project, product, event...). Give each a stable localId ("e1", "e2"...) used to reference it from facts.
- Each FACT links a subject entity to a predicate and a value. Use snake_case predicates (e.g. invoice_amount, due_date, sender_email, mentions).
- A relationship that carries its OWN attributes (an employment with a role and start date, a contract with a value and term, an enrollment) is ITSELF an entity: give it its own kind ("employment") and a stable label naming both ends ("James Porter — Acme Group"), link it to each end with entity-valued facts, and put the relationship's attributes on it. Simple attribute-less links stay plain facts.
- cardinality "one" = single-valued attribute (an invoice's amount); "many" = list-like (a person's several emails).
- valueType: "number" (put digits in valueNumber, plus unit like "USD"), "date" (valueDate as YYYY-MM-DD), "entity" (valueEntityLocalId referencing another entity), else "text" (valueText).
- Put strong identifiers on the entity (email/phone/invoiceNo) so duplicates can be resolved.
- confidence 0..1 per fact; overallConfidence 0..1 for the whole extraction.
- If there is no useful structured data, return empty arrays.
- MOST messages are transactional (invoices, confirmations, logistics, short replies): OMIT "note". But when the message is a substantive WRITE-UP the user dumped to keep (meeting notes, a braindump, a plan, an idea, research thoughts), ALSO return "note": {"title": "...", "body": "..."} — title ≤60 chars naming what it's about; body = the user's content distilled into clean markdown (short paragraphs/bullets, THEIR points faithfully — never invent, never pad).

Respond with ONLY a JSON object (no prose, no markdown fences).

Example — input "Invoice INV-9 from Acme for $100 due 2026-01-02, contact bob@acme.com":
{"entities":[{"localId":"e1","kind":"org","label":"Acme"},{"localId":"e2","kind":"invoice","label":"INV-9","invoiceNo":"INV-9"},{"localId":"e3","kind":"person","label":"Bob","email":"bob@acme.com"}],"facts":[{"subjectLocalId":"e2","predicate":"amount","cardinality":"one","valueType":"number","valueNumber":100,"unit":"USD","confidence":0.95},{"subjectLocalId":"e2","predicate":"due_date","cardinality":"one","valueType":"date","valueDate":"2026-01-02","confidence":0.95},{"subjectLocalId":"e2","predicate":"issued_by","cardinality":"one","valueType":"entity","valueEntityLocalId":"e1","confidence":0.9}],"overallConfidence":0.95}`;

export interface ExtractInput {
  text: string;
  subject?: string | null;
  sender?: string | null;
  channel?: string | null;
  /** The agent's intent, to steer what matters (optional). */
  agentPurpose?: string | null;
  /** The user's business context from onboarding — steers entity/predicate choices. */
  businessContext?: string | null;
  /** The user's kind registry — steers classification into their categories
   *  and canonicalizes the output's kinds/predicates against the templates. */
  kinds?: KindDef[];
  /** The user's existing concept labels — the leash that keeps topics from
   *  multiplying: prefer these, at most a few per message, never noun-soup. */
  concepts?: string[];
  /** Relevance-primed entities ALREADY IN the graph that look related to
   *  this input (labels only, never ids — see priming-core.ts): the model
   *  reuses their exact label/kind when the message refers to them, so the
   *  same real-world thing lands on the same record at the source. */
  known?: { kind: string; label: string; hint?: string }[];
}

export interface ExtractResult {
  extraction: Extraction;
  model: string;
  overallConfidence: number;
  escalated: boolean;
  /** Message mode: the pipeline-authored note when the message was a
   *  substantive dump worth keeping as a page (null otherwise). */
  note: GeneratedNote | null;
}

// Below this overall confidence we re-run on the escalation model.
const ESCALATE_BELOW = 0.55;

/** Bump when the prompt/pipeline changes enough that old extractions are
 *  stale — items with a lower stamp can then be requeued selectively
 *  (delta reprocessing) via POST /api/jobs/extract-requeue.
 *  v2 (2026-07-10): vision tier — image attachments previously landed
 *  metadata_only; requeue lets them be understood.
 *  v3 (2026-07-11): audio tier — audio attachments previously landed
 *  metadata_only; requeue lets them be transcribed.
 *  v4 (2026-07-16): relevance priming — the prompt now carries graph
 *  entities related to the input, so labels resolve consistently at the
 *  source. Requeue is OPTIONAL (older items are valid, just less
 *  label-consistent). */
export const EXTRACTION_VERSION = 4;

export function buildUserPrompt(input: ExtractInput): string {
  const parts: string[] = [];
  // NOTE: the CATEGORIES block deliberately does NOT live here — it is stable
  // per org, so it rides the SYSTEM prompt (see extractFromMessage), where
  // provider-side prompt caching (Anthropic cache_control, OpenAI automatic
  // prefix caching) can make it near-free across every message.
  const knownBlock = renderKnownBlock(input.known ?? []);
  if (knownBlock) parts.push(knownBlock);
  if (input.concepts?.length) {
    parts.push(
      `The user's existing CONCEPTS (topics): ${input.concepts.join(", ")}.\n` +
        "Tag content with AT MOST 3 concept entities. STRONGLY prefer these exact labels; invent a new concept only when the content is clearly about something not listed.",
    );
  }
  if (input.businessContext) parts.push(`About the user's work (use this to pick relevant entities, relationships, and predicate names): ${input.businessContext}`);
  if (input.agentPurpose) parts.push(`Assistant purpose: ${input.agentPurpose}`);
  if (input.channel) parts.push(`Channel: ${input.channel}`);
  if (input.sender) parts.push(`From: ${input.sender}`);
  if (input.subject) parts.push(`Subject: ${input.subject}`);
  // The explicit gesture: a subject like "note: …" / "memo …" says the user is
  // dumping something to KEEP — always author the note for these.
  if (input.subject && /^(note|notes|memo)\b/i.test(input.subject.trim())) {
    parts.push("The user explicitly marked this message as a note to keep — you MUST return the note object.");
  }
  parts.push(`\nMessage:\n${input.text}`);
  return parts.join("\n");
}

/** Map the flat LLM output to the internal Extraction contract, defensively. */
function toExtraction(raw: LlmExtraction): Extraction {
  const entities = (raw.entities ?? [])
    .filter((e) => e?.localId && e?.label)
    .map((e) => {
      const naturalKeys: Record<string, string> = {};
      if (e.email) naturalKeys.email = e.email;
      if (e.phone) naturalKeys.phone = e.phone;
      if (e.invoiceNo) naturalKeys.invoice_no = e.invoiceNo;
      return { localId: e.localId, kind: e.kind || "thing", label: e.label, naturalKeys };
    });

  const facts: ExtractedFact[] = [];
  for (const f of raw.facts ?? []) {
    if (!f?.subjectLocalId || !f?.predicate || !f?.valueType) continue;
    let value: ExtractedFact["value"] | null = null;
    if (f.valueType === "number" && typeof f.valueNumber === "number") {
      value = { kind: "number", num: f.valueNumber, unit: f.unit };
    } else if (f.valueType === "date" && f.valueDate) {
      value = { kind: "date", date: f.valueDate };
    } else if (f.valueType === "entity" && f.valueEntityLocalId) {
      value = { kind: "entity", entityLocalId: f.valueEntityLocalId };
    } else if (f.valueText) {
      value = { kind: "text", text: f.valueText };
    }
    if (!value) continue;
    facts.push({
      subjectLocalId: f.subjectLocalId,
      predicate: f.predicate,
      cardinality: f.cardinality === "many" ? "many" : "one",
      value,
      confidence: typeof f.confidence === "number" ? f.confidence : undefined,
      snippet: f.snippet,
    });
  }
  return { entities, facts };
}

/** Extract entities + facts from one message. Small model first; escalate if
 *  the model reports low confidence. Pass `llm` to run on a specific provider
 *  (e.g. the user's own BYOK account); defaults to the platform provider. */
export async function extractFromMessage(
  input: ExtractInput,
  llm: LlmProvider = getLlmProvider(),
): Promise<ExtractResult> {
  const user = buildUserPrompt(input);
  // Stable content leads: SYSTEM + the org's categories form a per-org
  // constant prefix, so provider prompt caches hit on every message.
  const system = input.kinds?.length ? `${SYSTEM}\n\n${promptCategories(input.kinds)}` : SYSTEM;

  const run = async (model: string) =>
    llm.chatJSON<LlmExtraction>({
      model,
      system,
      user,
      schema: RESPONSE_SCHEMA,
      schemaName: "extraction",
      // Headroom: several free models are reasoning models that spend a big
      // chunk of the budget "thinking" before emitting the JSON answer, so a
      // richer email can truncate at a small cap.
      maxTokens: 8000,
    });

  let model = llm.models.extract;
  let raw = await run(model);
  let confidence = typeof raw.overallConfidence === "number" ? raw.overallConfidence : 1;
  let escalated = false;

  if (confidence < ESCALATE_BELOW && llm.models.escalate !== llm.models.extract) {
    model = llm.models.escalate;
    raw = await run(model);
    confidence = typeof raw.overallConfidence === "number" ? raw.overallConfidence : confidence;
    escalated = true;
  }

  // Canonicalize against the user's registry: kind synonyms collapse to the
  // canonical slug, predicate synonyms to template field keys — so the same
  // real-world fact always produces the same claim key.
  const extraction = input.kinds?.length
    ? canonicalizeExtraction(toExtraction(raw), input.kinds)
    : toExtraction(raw);
  const note =
    raw.note && typeof raw.note.title === "string" && typeof raw.note.body === "string" && raw.note.body.trim()
      ? { title: raw.note.title.trim() || "Note", body: raw.note.body.trim() }
      : null;
  return { extraction, note, model: `${llm.name}:${model}`, overallConfidence: confidence, escalated };
}

// --- Documents: classify-first, template-restrained extraction ----------------
//
// A document is NOT free-ranged like a message. The pipeline is:
//   ① classify — a cheap call decides which category the document's PRIMARY
//     content is (invoice, research paper, contract…), from the user's registry;
//   ② distill — extraction is focused on THAT kind's template (its fields and
//     relation verbs only) + at most 3 concepts + a markdown SUMMARY that
//     becomes the document node's body (entities.body_md).
// The full text survives regardless (doc_chunks + the original blob), so the
// graph only receives what the template says matters — no noise star-clusters.

const CLASSIFY_SYSTEM = `You classify ONE DOCUMENT into the best-fitting category from a user's list.
Respond with ONLY a JSON object: {"kind": "<category slug>", "confidence": 0..1}.
Judge by the document's PRIMARY content — what the document IS, not what it merely mentions. If none fits, use "other".`;

const CLASSIFY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { kind: { type: "string" }, confidence: { type: "number" } },
  required: ["kind"],
};

export interface DocClassification {
  /** A canonical registry slug, or null when nothing fits ("other"). */
  kind: string | null;
  confidence: number;
}

/** ① The cheap classify call. Returns null kind when the registry has no fit —
 *  the caller then falls back to the generic document template. */
export async function classifyDocumentKind(
  args: { filename?: string | null; text: string; kinds: KindDef[] },
  llm: LlmProvider = getLlmProvider(),
): Promise<DocClassification> {
  const raw = await llm.chatJSON<{ kind?: string; confidence?: number }>({
    model: llm.models.extract,
    system: CLASSIFY_SYSTEM,
    user: buildClassifyPrompt(args),
    schema: CLASSIFY_SCHEMA,
    schemaName: "classification",
    maxTokens: 2000,
  });
  const slug = slugify(raw.kind ?? "");
  const hit = args.kinds.find((k) => k.kind === slug || k.aliases.some((a) => slugify(a) === slug));
  return {
    kind: hit?.kind ?? null,
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
  };
}

const DOC_SYSTEM = `You distill ONE DOCUMENT (a file the user received) into structured knowledge for a personal data assistant.

The document's full text is archived elsewhere — you are DISTILLING, not transcribing.

Return:
1. "summary": the document's PAGE in the user's knowledge vault — well-formed markdown a note-taking app would be proud of:
   - Open with a 2–4 sentence overview a reader can trust without opening the document.
   - Add "## " sections when the document has real structure (terms, findings, line items…); short bullets over prose walls.
   - Put the key structured values in a compact "| field | value |" table.
   - Bold the load-bearing figures (**$100**, **2026-01-02**).
   - Wrap every entity you ALSO return in facts as a [[wikilink]] with its exact label (e.g. [[Acme Group]]) — the app renders these as live links into the graph.
   - No heading repeating the filename. Length follows the document: an invoice is short, a report earns sections.
2. entities/facts: the document's PRIMARY SUBJECT as the FIRST entity ("e1"), using the category and ONLY the template predicates given in the instructions; entities the template's relation verbs point at; plus concept tags.
- Tag with AT MOST 3 "concept" entities for what the document is about (research area, topic, technique). STRONGLY prefer the user's existing concepts when given.
- NEVER extract incidental entities, passing mentions, boilerplate, or facts outside the template. Fewer, correct facts beat many.
- Fact values: valueType "number" (digits in valueNumber, plus unit like "USD"), "date" (valueDate as YYYY-MM-DD), "entity" (valueEntityLocalId), else "text" (valueText). Use snake_case predicates. Put strong identifiers (email/phone/invoiceNo) on entities.
- confidence 0..1 per fact; overallConfidence 0..1 overall.

Respond with ONLY a JSON object (no prose, no markdown fences).

Example — an invoice PDF, category "invoice" with fields amount/due_date/invoice_no and relation issued_by→company:
{"summary":"Invoice **INV-9** from Acme for **$100**, due 2026-01-02. Covers January consulting.","entities":[{"localId":"e1","kind":"invoice","label":"INV-9","invoiceNo":"INV-9"},{"localId":"e2","kind":"company","label":"Acme"}],"facts":[{"subjectLocalId":"e1","predicate":"amount","valueType":"number","valueNumber":100,"unit":"USD","confidence":0.95},{"subjectLocalId":"e1","predicate":"due_date","valueType":"date","valueDate":"2026-01-02","confidence":0.95},{"subjectLocalId":"e1","predicate":"issued_by","valueType":"entity","valueEntityLocalId":"e2","confidence":0.9}],"overallConfidence":0.95}`;

export interface DocumentExtractInput extends DocumentPromptInput {
  channel?: string | null;
}

export interface DocumentExtractResult extends ExtractResult {
  /** The markdown summary — the document node's body (null when the model
   *  returned none). */
  summary: string | null;
  /** What the document was classified as (registry slug), or null. */
  docKind: string | null;
  /** Facts the template restraint dropped, packaged for the Review queue
   *  (accept = ingest them anyway). Null when nothing was dropped. */
  offTemplateReview: OffTemplateReviewPayload | null;
}

/** ①+② Extract a DOCUMENT: classify into the user's categories, then distill
 *  to that category's template + concepts + a markdown summary. */
export async function extractFromDocument(
  input: DocumentExtractInput,
  llm: LlmProvider = getLlmProvider(),
): Promise<DocumentExtractResult> {
  let docKind = input.docKind ?? null;
  if (!docKind && input.kinds?.length) {
    try {
      docKind = (await classifyDocumentKind({ filename: input.filename, text: input.text, kinds: input.kinds }, llm)).kind;
    } catch (e) {
      console.error("[extract] document classification failed; using generic template", e);
    }
  }

  const user = buildDocumentPrompt({ ...input, docKind });
  const run = async (model: string) =>
    llm.chatJSON<LlmExtraction>({
      model,
      system: DOC_SYSTEM,
      user,
      schema: DOC_RESPONSE_SCHEMA,
      schemaName: "document_extraction",
      maxTokens: 8000,
    });

  let model = llm.models.extract;
  let raw = await run(model);
  let confidence = typeof raw.overallConfidence === "number" ? raw.overallConfidence : 1;
  let escalated = false;
  if (confidence < ESCALATE_BELOW && llm.models.escalate !== llm.models.extract) {
    model = llm.models.escalate;
    raw = await run(model);
    confidence = typeof raw.overallConfidence === "number" ? raw.overallConfidence : confidence;
    escalated = true;
  }

  const { extraction, offTemplateReview } = restrainForKinds(toExtraction(raw), input.kinds, "document");
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : null;
  return { extraction, summary, docKind, note: null, model: `${llm.name}:${model}`, overallConfidence: confidence, escalated, offTemplateReview };
}

/** Shared post-LLM tail for the document-shaped pipelines (files + images):
 *  canonicalize, restrain to the templates, and package the drops as a
 *  replayable off-template review (accept = "add anyway"). */
function restrainForKinds(
  extraction: Extraction,
  kinds: KindDef[] | undefined,
  what: string,
): { extraction: Extraction; offTemplateReview: OffTemplateReviewPayload | null } {
  if (!kinds?.length) return { extraction, offTemplateReview: null };
  const canon = canonicalizeExtraction(extraction, kinds);
  const restricted = restrictExtractionToTemplates(canon, kinds, { maxConcepts: 3 });
  if (restricted.droppedFacts || restricted.droppedEntities) {
    console.log(
      `[extract] ${what} restraint dropped ${restricted.droppedFacts} off-template facts, ${restricted.droppedEntities} incidental entities`,
    );
  }
  // Built from the PRE-restriction extraction so the payload replays through
  // ingest on its own.
  return { extraction: restricted.extraction, offTemplateReview: buildOffTemplateReview(canon, restricted.offTemplate) };
}

// --- Vision tier: an IMAGE attachment → understood thick node --------------------

const IMG_SYSTEM = `You LOOK at ONE IMAGE the user received (a photo, screenshot, or scan — possibly several images that are the consecutive pages of ONE scanned document) and distill it into structured knowledge for a personal data assistant.

The original image is archived elsewhere — you are DISTILLING what it shows, not describing pixels.

Return:
1. "summary": a compact markdown summary (2–6 sentences) of what the image shows and says. Transcribe the load-bearing text and numbers (amounts, dates, names, ids) so a reader never has to open the image. No heading repeating the filename.
2. entities/facts: the image's PRIMARY SUBJECT as the FIRST entity ("e1"), classified into one of the given categories and using ONLY that category's template predicates; entities its relation verbs point at; plus concept tags.
- Tag with AT MOST 3 "concept" entities for what the image is about. STRONGLY prefer the user's existing concepts when given.
- NEVER extract incidental entities, decorative text, or facts outside the template. Fewer, correct facts beat many.
- Fact values: valueType "number" (digits in valueNumber, plus unit like "USD"), "date" (valueDate as YYYY-MM-DD), "entity" (valueEntityLocalId), else "text" (valueText). Use snake_case predicates. Put strong identifiers (email/phone/invoiceNo) on entities.
- If the image is unreadable or purely decorative, return empty entities/facts and say so in the summary.
- confidence 0..1 per fact; overallConfidence 0..1 overall.

Respond with ONLY a JSON object (no prose, no markdown fences).`;

export interface ImageExtractInput {
  /** Raw image bytes, base64-encoded (no data: prefix). */
  imageBase64: string;
  /** image/png | image/jpeg | image/webp | image/gif */
  mediaType: string;
  /** Pages 2..N of a multi-page scanned document, in order — sent in the SAME
   *  vision call so the whole document is one coherent extraction. */
  additionalPages?: { imageBase64: string; mediaType: string }[];
  filename?: string | null;
  channel?: string | null;
  businessContext?: string | null;
  kinds?: KindDef[];
  concepts?: string[];
}

/** Vision tier: one call classifies AND extracts (a second vision pass costs
 *  real money, so no separate classify step and no escalation ladder —
 *  `models.vision` is already the provider's designated seeing model). A
 *  non-vision model simply errors and the caller degrades to metadata_only. */
export async function extractFromImage(
  input: ImageExtractInput,
  llm: LlmProvider = getLlmProvider(),
): Promise<DocumentExtractResult> {
  const extraPages = input.additionalPages ?? [];
  const raw = await llm.chatJSON<LlmExtraction>({
    model: llm.models.vision,
    system: IMG_SYSTEM,
    user:
      buildImagePrompt(input) +
      (extraPages.length
        ? `\n\nThe ${extraPages.length + 1} images are the CONSECUTIVE PAGES of ONE scanned document, in order. Read them as a single document: one summary, one primary entity ("e1"), facts drawn from ANY page.`
        : ""),
    images: [
      { mediaType: input.mediaType, dataBase64: input.imageBase64 },
      ...extraPages.map((p) => ({ mediaType: p.mediaType, dataBase64: p.imageBase64 })),
    ],
    schema: DOC_RESPONSE_SCHEMA,
    schemaName: "image_extraction",
    maxTokens: 8000,
  });
  const confidence = typeof raw.overallConfidence === "number" ? raw.overallConfidence : 1;
  const { extraction, offTemplateReview } = restrainForKinds(toExtraction(raw), input.kinds, "image");
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : null;
  // The classification IS the primary entity's kind (single-call design).
  const docKind = extraction.entities[0]?.kind ?? null;
  return {
    extraction,
    summary,
    docKind,
    note: null,
    model: `${llm.name}:${llm.models.vision}`,
    overallConfidence: confidence,
    escalated: false,
    offTemplateReview,
  };
}

// --- Glue: item (status 'stored') → extract → knowledge layer (steps ⑤+⑥) ----

interface ItemRow {
  id: string;
  org_id: string;
  owner_user_id: string | null;
  subject: string | null;
  sender: string | null;
  channel: string | null;
  body_hash: string | null;
  body_preview: string | null;
  /** Channel envelope (jsonb) — chat addressing stores `agent_id` here. */
  meta?: unknown;
}

/** Load an item's best-available text (full body blob, else the preview).
 *  Exported for the MCP pull model (process_inbox hands Claude the text). */
export async function loadItemText(item: Pick<ItemRow, "org_id" | "body_hash" | "body_preview">): Promise<string> {
  if (item.body_hash) {
    try {
      const buf = await readBlob(item.org_id, item.body_hash);
      const parsed = JSON.parse(buf.toString("utf8")) as { text?: string; html?: string };
      if (parsed.text) return parsed.text;
      if (parsed.html) return parsed.html.replace(/<[^>]+>/g, " "); // crude strip
    } catch {
      /* fall through to preview */
    }
  }
  return item.body_preview ?? "";
}

/**
 * Run extraction for one captured item and fold the result into the knowledge
 * layer. Drives item.status stored → analyzing → analyzed | failed.
 */
/**
 * Atomically claim up to `limit` captured items for extraction, flipping them
 * stored → analyzing in one statement. `FOR UPDATE SKIP LOCKED` means concurrent
 * cron ticks never grab the same row — this is the Neon-native queue (no pgmq).
 * Returns the claimed item ids for the caller to run extraction on.
 */
export async function claimStoredItems(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    update items
       set status = 'analyzing', claimed_at = now(), attempts = attempts + 1
     where id in (
       select id from items
        where status = 'stored'
        order by received_at asc nulls last
        limit ${limit}
        for update skip locked
     )
    returning id`;
  return rows.map((r) => r.id);
}

// A tick that dies mid-extraction leaves items stuck in 'analyzing'; transient
// LLM/network errors leave them 'failed'. Both get another shot — capped, so a
// poison item can't loop forever.
const MAX_ATTEMPTS = 3;
const ORPHAN_AFTER_MINUTES = 10;

/**
 * Recover the queue before claiming: stale 'analyzing' orphans and retryable
 * 'failed' items go back to 'stored'; orphans that already burned all their
 * attempts are marked 'failed' instead. Returns counts for observability.
 */
export async function recoverExtractionQueue(): Promise<{ requeued: number; abandoned: number }> {
  const requeued = await prisma.$executeRaw`
    update items
       set status = 'stored', claimed_at = null
     where (status = 'analyzing'
            and (claimed_at is null or claimed_at < now() - make_interval(mins => ${ORPHAN_AFTER_MINUTES}))
            and attempts < ${MAX_ATTEMPTS})
        or (status = 'failed' and attempts < ${MAX_ATTEMPTS})`;
  const abandoned = await prisma.$executeRaw`
    update items
       set status = 'failed',
           error = coalesce(error, 'extraction timed out (tick died mid-run)')
     where status = 'analyzing'
       and (claimed_at is null or claimed_at < now() - make_interval(mins => ${ORPHAN_AFTER_MINUTES}))
       and attempts >= ${MAX_ATTEMPTS}`;
  return { requeued, abandoned };
}

/** Outbound leg of the parse reply — thin wrapper for mockability/clarity. */
async function sendParseReplyToChannel(channel: string | null, sender: string, text: string) {
  const { sendChannelText } = await import("./outbound");
  return sendChannelText(channel as import("@/lib/ingest/types").IngestChannel, sender, text);
}

export async function runExtractionForItem(
  itemId: string,
  agentPurpose?: string | null,
): Promise<ExtractResult & { knowledge: Awaited<ReturnType<typeof ingestExtraction>> }> {
  const item = await prisma.items.findUniqueOrThrow({
    where: { id: itemId },
    select: {
      id: true,
      org_id: true,
      owner_user_id: true,
      subject: true,
      sender: true,
      channel: true,
      capture_mode: true,
      body_hash: true,
      body_preview: true,
      meta: true,
    },
  });
  const row = item as unknown as ItemRow & { capture_mode: string | null };

  await prisma.items.update({ where: { id: row.id }, data: { status: "analyzing" } });
  try {
    const text = await loadItemText(row);
    // TRIVIALITY GATE (efficiency track 2026-07-16): unmistakable acks never
    // reach an LLM or an embedding — steering, priming, and extraction are
    // all skipped and the item files as analyzed with zero facts (the chat
    // reply still answers "Nothing to file"). Attachments always pass.
    const { worthExtracting } = await import("./extract-gate");
    const hasAttachments =
      (await prisma.attachments.count({ where: { item_id: row.id } }).catch(() => 0)) > 0;
    const trivial = !worthExtracting({ text, subject: row.subject, hasAttachments });
    // Addressed items (chat "@agent" / picker) carry their agent in meta —
    // that agent's purpose steers extraction. An explicit param still wins;
    // no addressee = no steering (the general datamodo agent). Best-effort.
    const addressedAgentId = (row.meta as { agent_id?: string } | null)?.agent_id;
    if (!trivial && agentPurpose == null && addressedAgentId) {
      agentPurpose = await prisma.agents
        .findFirst({ where: { id: addressedAgentId, org_id: row.org_id }, select: { purpose_text: true } })
        .then((a) => a?.purpose_text ?? null)
        .catch(() => null);
    }
    // UNADDRESSED items: zero-cost auto-routing (user call 2026-07-16). A
    // deterministic lexical classifier (agent-router.ts — no LLM, no spend)
    // matches the item against the ACTIVE AUTO agents' purposes; a confident
    // winner's purpose steers extraction and the pick is stamped on the item
    // (routed_agent_*) for attribution. Ambiguity/no-match = the generic
    // datamodo agent, exactly as before. Best-effort: never fails the item.
    if (!trivial && agentPurpose == null && !addressedAgentId) {
      try {
        const autoAgents = await prisma.agents.findMany({
          where: { org_id: row.org_id, status: "active", mode: "auto", NOT: { purpose_text: null } },
          select: { id: true, name: true, purpose_text: true },
        });
        if (autoAgents.length > 0) {
          const { buildAgentProfiles, routeToAgent } = await import("./agent-router");
          const routed = routeToAgent(
            `${row.subject ?? ""}\n${text}`,
            buildAgentProfiles(autoAgents.map((a) => ({ id: a.id, name: a.name, purposeText: a.purpose_text ?? "" }))),
          );
          if (routed) {
            const a = autoAgents.find((x) => x.id === routed.agentId)!;
            agentPurpose = a.purpose_text;
            await prisma.items
              .update({
                where: { id: row.id },
                data: {
                  meta: {
                    ...((row.meta as Record<string, unknown> | null) ?? {}),
                    routed_agent_id: a.id,
                    routed_agent_name: a.name,
                    routed_terms: routed.matched.slice(0, 6),
                  },
                },
              })
              .catch(() => {});
          }
        }
      } catch {
        /* routing is best-effort — generic steering otherwise */
      }
    }
    const businessContext = !trivial && row.owner_user_id
      ? (await getOnboardingContext(row.owner_user_id)).businessContext
      : null;
    // The user's category registry steers classification + canonicalizes
    // kinds/predicates. Best-effort: extraction works without it.
    const { listKinds } = await import("./kinds");
    const kinds = trivial ? [] : await listKinds(row.org_id, row.owner_user_id).catch(() => []);
    // RELEVANCE PRIMING (user call 2026-07-16): candidates chosen BY the
    // input — labels literally in the text + ANN over one message embedding —
    // replace the old static top-30 concept list. Non-concepts feed the
    // prompt's "already in your graph" block (labels only, never-force
    // wording); concepts stay their own leash line, primed-first and topped
    // up from the support ranking so it never goes empty without embeddings.
    const { primeKnownEntities } = await import("./priming");
    const { conceptsForPrompt } = await import("./priming-core");
    const known = trivial
      ? []
      : await primeKnownEntities(row.org_id, `${row.subject ?? ""}\n${text}`).catch(() => []);
    const conceptRows = trivial
      ? []
      : await prisma.entities
          .findMany({
            where: { org_id: row.org_id, kind: "concept", merged_into: null },
            select: { canonical_label: true },
            orderBy: { support: "desc" },
            take: 30,
          })
          .catch(() => []);
    const concepts = conceptsForPrompt(known, conceptRows.map((c) => c.canonical_label));
    // BYOK: analysis runs on the owner's own provider account when they've
    // brought a key; otherwise on the platform provider from env. Trivial
    // items never resolve a provider at all (a BYOK cap must not fail them).
    let llm: LlmProvider | undefined;
    let result: ExtractResult;
    if (trivial) {
      result = {
        extraction: { entities: [], facts: [] },
        note: null,
        model: "gate:trivial",
        overallConfidence: 1,
        escalated: false,
      };
    } else {
      llm = await llmForUser(row.owner_user_id);
      result = await extractFromMessage(
        {
          text,
          subject: row.subject,
          sender: row.sender,
          channel: row.channel,
          agentPurpose,
          businessContext,
          kinds,
          concepts,
          known,
        },
        llm,
      );
    }
    const knowledge = await ingestExtraction(row.org_id, row.owner_user_id, row.id, result.extraction, llm);
    // A substantive dump becomes a NOTE the pipeline authors: a thick node
    // whose body is our distilled markdown, edged to what the message
    // mentioned. Best-effort — a note failure never fails the item.
    if (result.note) {
      try {
        const noteX = buildNoteExtraction(row.id, result.note, result.extraction);
        await ingestExtraction(row.org_id, row.owner_user_id, row.id, noteX, llm);
        const noteEnt = await prisma.entities.findFirst({
          where: {
            org_id: row.org_id,
            kind: NOTE_KIND,
            normalized_key: normalizeKey(noteX.entities[0]),
            merged_into: null,
          },
          select: { id: true },
        });
        if (noteEnt) {
          await prisma.entities.update({
            where: { id: noteEnt.id, org_id: row.org_id },
            data: { body_md: result.note.body, updated_at: new Date() },
          });
        }
      } catch (e) {
        console.error(`[extract] note authoring failed for item ${row.id}`, e);
      }
    }
    // Attachments → document entities in the graph (best-effort; a missing
    // blob bucket or a scanned PDF degrades to metadata-only, never fails the
    // item). Dynamic import: documents.ts uses extractFromMessage, so a static
    // import here would be circular.
    let docResults: import("./documents").AttachmentProcessResult[] = [];
    if (!trivial && llm) {
      try {
        const { processItemAttachments } = await import("./documents");
        docResults = await processItemAttachments(row, llm, businessContext, kinds, concepts);
      } catch (e) {
        console.error(`[extract] attachment processing failed for item ${row.id}`, e);
      }
    }
    // AGENT LENS stamp (GRAPH_PIPELINE.md P5): facts remember which agent's
    // pipeline wrote them. Attribution reads back off the item's meta (the
    // addressed/routed stamps above), covering body AND attachment facts in
    // one statement. Fail-soft: a pre-migration DB just skips it.
    try {
      await prisma.$executeRaw`
        UPDATE facts f
           SET agent_id = COALESCE(
                 NULLIF(i.meta->>'agent_id', '')::uuid,
                 NULLIF(i.meta->>'routed_agent_id', '')::uuid)
          FROM items i
         WHERE i.id = ${row.id}::uuid AND f.source_item_id = i.id
           AND f.org_id = ${row.org_id}::uuid AND f.agent_id IS NULL
           AND (i.meta ? 'agent_id' OR i.meta ? 'routed_agent_id')`;
    } catch {
      /* lens column not migrated yet — attribution still lives on the item */
    }
    // Growth loop ⑤: entities of a kind the registry doesn't know, once seen
    // often enough, become a PROPOSED category (AI-drafted template) in the
    // Review queue. Best-effort — a proposal failure never fails the item.
    try {
      const { maybeProposeCategories } = await import("./kinds");
      await maybeProposeCategories(row.org_id, row.owner_user_id, result.extraction, kinds);
    } catch (e) {
      console.error(`[extract] category proposal check failed for item ${row.id}`, e);
    }
    // Low-confidence extractions get surfaced for the user to confirm; confident
    // ones file silently (keeps the review queue meaningful, not a firehose).
    const EXTRACTION_REVIEW_BELOW = 0.75;
    if (result.overallConfidence < EXTRACTION_REVIEW_BELOW && result.extraction.facts.length > 0) {
      await createExtractionReview(row.org_id, row.owner_user_id, {
        itemId: row.id,
        snippet: text,
        confidence: result.overallConfidence,
        factCount: result.extraction.facts.length,
      });
    }
    await prisma.items.update({
      where: { id: row.id },
      data: { status: "analyzed", extraction_version: EXTRACTION_VERSION },
    });
    // PINGED? → answer back with what was parsed. Direct pings only
    // (capture_mode "active": app chat, Slack DM, WhatsApp, direct email) —
    // passively watched mailboxes stay silent. The app thread stores the
    // reply on the item (meta.parse_reply → an agent bubble in chat);
    // outbound channels go through sendChannelText. Best-effort.
    let questionCount = 0;
    try {
      const { pendingQuestions } = await import("./review-inbox");
      questionCount = (await pendingQuestions(row.org_id, row.id)).length;
    } catch { /* count is decoration on the reply */ }
    try {
      const { buildParseReply, shouldSendParseReply } = await import("./parse-reply");
      const viaApp = row.channel === "upload" && (row.meta as { via?: string } | null)?.via === "app";
      const mode = shouldSendParseReply({ captureMode: row.capture_mode, channel: row.channel, viaApp });
      if (mode) {
        const reply = buildParseReply({
          extraction: result.extraction,
          noteTitle: result.note?.title ?? null,
          docs: docResults.map((d) => ({ filename: d.filename, factsNew: d.factsNew })),
          pendingQuestions: viaApp ? 0 : questionCount, // the app thread shows the review bubble itself
        });
        if (mode === "app") {
          // Fresh meta: the auto-router may have stamped routed_agent_* since
          // `row` was loaded — a stale spread would drop it.
          const fresh = await prisma.items.findUnique({ where: { id: row.id }, select: { meta: true } });
          await prisma.items.update({
            where: { id: row.id },
            data: {
              meta: {
                ...((fresh?.meta as Record<string, unknown> | null) ?? {}),
                parse_reply: reply,
                parse_reply_at: new Date().toISOString(),
              },
            },
          });
        } else if (row.sender) {
          const sent = await sendParseReplyToChannel(row.channel, row.sender, reply);
          if (!sent.sent) console.log(`[extract] parse reply skipped for item ${row.id}: ${sent.reason}`);
        }
      }
    } catch (e) {
      console.error(`[extract] parse reply failed for item ${row.id}`, e);
    }
    // The PULL REQUEST comes to the user: if THIS message left decisions
    // behind (reviews / proposed rows), ping them back over the channel it
    // arrived on — reply "1 yes" approves right in the thread. Best-effort
    // and env-gated (no Twilio/Slack creds = dormant); never fails the item.
    try {
      const { pendingQuestions, pendingProposalCount } = await import("./review-inbox");
      const questions = await pendingQuestions(row.org_id, row.id);
      const proposals = await pendingProposalCount(row.org_id, row.id);
      if ((questions.length > 0 || proposals > 0) && row.sender) {
        const { buildReviewPing } = await import("./review-ping");
        const { sendChannelText } = await import("./outbound");
        const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || null;
        // Only channels whose webhooks parse decisions get the reply hint.
        const replyable = row.channel === "whatsapp" || row.channel === "slack";
        const text = questions.length
          ? buildReviewPing(questions, { reviewUrl: appUrl ? `${appUrl}/dashboard` : null, extraProposals: proposals, replyable })
          : `datamodo — ${proposals} table change${proposals === 1 ? "" : "s"} from your message await review${appUrl ? `: ${appUrl}/dashboard` : "."}`;
        const sent = await sendChannelText(row.channel as import("@/lib/ingest/types").IngestChannel, row.sender, text);
        if (!sent.sent) console.log(`[extract] review ping skipped for item ${row.id}: ${sent.reason}`);
      }
    } catch (e) {
      console.error(`[extract] review ping failed for item ${row.id}`, e);
    }
    return { ...result, knowledge };
  } catch (e) {
    await prisma.items.update({
      where: { id: row.id },
      data: { status: "failed", error: String((e as Error)?.message ?? e).slice(0, 500) },
    });
    throw e;
  }
}
