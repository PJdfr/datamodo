import type { SupabaseClient } from "@supabase/supabase-js";
import { getLlmProvider } from "@/lib/llm";
import { readBlob } from "@/lib/ingest/store";
import { ingestExtraction, createExtractionReview, type Extraction, type ExtractedFact } from "@/lib/datamodo/knowledge";
import { getOnboardingContext } from "@/lib/datamodo/settings";

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
  },
  required: ["entities", "facts"],
};

const SYSTEM = `You extract structured facts from a SINGLE communication (an email or chat message) for a personal data assistant.

Rules:
- Return ONLY facts supported by the text. Never invent data.
- Model real-world things as ENTITIES (person, org, invoice, project, product, event...). Give each a stable localId ("e1", "e2"...) used to reference it from facts.
- Each FACT links a subject entity to a predicate and a value. Use snake_case predicates (e.g. invoice_amount, due_date, sender_email, mentions).
- cardinality "one" = single-valued attribute (an invoice's amount); "many" = list-like (a person's several emails).
- valueType: "number" (put digits in valueNumber, plus unit like "USD"), "date" (valueDate as YYYY-MM-DD), "entity" (valueEntityLocalId referencing another entity), else "text" (valueText).
- Put strong identifiers on the entity (email/phone/invoiceNo) so duplicates can be resolved.
- confidence 0..1 per fact; overallConfidence 0..1 for the whole extraction.
- If there is no useful structured data, return empty arrays.

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
}

export interface ExtractResult {
  extraction: Extraction;
  model: string;
  overallConfidence: number;
  escalated: boolean;
}

// Below this overall confidence we re-run on the escalation model.
const ESCALATE_BELOW = 0.55;

function buildUserPrompt(input: ExtractInput): string {
  const parts: string[] = [];
  if (input.businessContext) parts.push(`About the user's work (use this to pick relevant entities, relationships, and predicate names): ${input.businessContext}`);
  if (input.agentPurpose) parts.push(`Assistant purpose: ${input.agentPurpose}`);
  if (input.channel) parts.push(`Channel: ${input.channel}`);
  if (input.sender) parts.push(`From: ${input.sender}`);
  if (input.subject) parts.push(`Subject: ${input.subject}`);
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
 *  the model reports low confidence. */
export async function extractFromMessage(input: ExtractInput): Promise<ExtractResult> {
  const user = buildUserPrompt(input);
  const llm = getLlmProvider();

  const run = async (model: string) =>
    llm.chatJSON<LlmExtraction>({
      model,
      system: SYSTEM,
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

  return { extraction: toExtraction(raw), model: `${llm.name}:${model}`, overallConfidence: confidence, escalated };
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
}

/** Load an item's best-available text (full body blob, else the preview). */
async function loadItemText(admin: SupabaseClient, item: ItemRow): Promise<string> {
  if (item.body_hash) {
    try {
      const buf = await readBlob(item.org_id, item.body_hash, admin);
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
export async function runExtractionForItem(
  admin: SupabaseClient,
  itemId: string,
  agentPurpose?: string | null,
): Promise<ExtractResult & { knowledge: Awaited<ReturnType<typeof ingestExtraction>> }> {
  const { data: item, error } = await admin
    .from("items")
    .select("id, org_id, owner_user_id, subject, sender, channel, body_hash, body_preview")
    .eq("id", itemId)
    .single();
  if (error) throw error;
  const row = item as ItemRow;

  await admin.from("items").update({ status: "analyzing" }).eq("id", row.id);
  try {
    const text = await loadItemText(admin, row);
    const businessContext = row.owner_user_id
      ? (await getOnboardingContext(admin, row.owner_user_id)).businessContext
      : null;
    const result = await extractFromMessage({
      text,
      subject: row.subject,
      sender: row.sender,
      channel: row.channel,
      agentPurpose,
      businessContext,
    });
    const knowledge = await ingestExtraction(admin, row.org_id, row.owner_user_id, row.id, result.extraction);
    // Low-confidence extractions get surfaced for the user to confirm; confident
    // ones file silently (keeps the review queue meaningful, not a firehose).
    const EXTRACTION_REVIEW_BELOW = 0.75;
    if (result.overallConfidence < EXTRACTION_REVIEW_BELOW && result.extraction.facts.length > 0) {
      await createExtractionReview(admin, row.org_id, row.owner_user_id, {
        itemId: row.id,
        snippet: text,
        confidence: result.overallConfidence,
        factCount: result.extraction.facts.length,
      });
    }
    await admin.from("items").update({ status: "analyzed" }).eq("id", row.id);
    return { ...result, knowledge };
  } catch (e) {
    await admin
      .from("items")
      .update({ status: "failed", error: String((e as Error)?.message ?? e).slice(0, 500) })
      .eq("id", row.id);
    throw e;
  }
}
