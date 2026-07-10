import type { Extraction, ExtractedEntity, ExtractedFact } from "./knowledge";

// Ontology layer (pure core, no DB): the user-editable kind registry that
// keeps the graph navigable. The storage substrate stays universal — one node
// shape, facts as verb-edges — this layer supplies the VOCABULARY: which
// kinds exist, what fields each should carry, and which verbs connect them.
//
// It steers extraction (the prompt gets the category menu), then
// CANONICALIZES what the LLM returns: kind synonyms collapse to the canonical
// slug ("org" → "company") and predicate synonyms collapse to template field
// keys ("invoice_amount" → "amount"), so the same real-world fact always
// produces the same claim key — fixing the predicate-drift dedup bug.
// Templates steer, never block: off-template kinds/predicates pass through
// slugified but otherwise untouched.

export interface KindField {
  key: string; // canonical predicate, snake_case ("amount")
  label: string; // "Amount"
  type: "text" | "number" | "date" | "entity";
  unit?: string;
  required?: boolean;
  /** Synonyms the LLM tends to produce; canonicalized to `key`. */
  aliases?: string[];
}

export interface KindRelation {
  predicate: string; // canonical verb, snake_case ("issued_by")
  label: string; // "issued by"
  /** Kind the edge usually points at ("company"); informative, not enforced. */
  targetKind?: string;
  aliases?: string[];
}

export interface KindDef {
  id?: string;
  kind: string; // canonical slug ("company")
  label: string;
  plural?: string;
  icon?: string;
  color?: string;
  /** What belongs in this category — steers the classifier. */
  description?: string;
  /** Kind-name synonyms ("org", "organization"). */
  aliases: string[];
  fields: KindField[];
  relations: KindRelation[];
  builtin: boolean;
}

/** The editable starting ontology every org gets. Deliberately small — the
 *  registry grows by the user's hand (or approved agent proposals), not by
 *  LLM drift. */
export const DEFAULT_KINDS: KindDef[] = [
  {
    kind: "person",
    label: "Person",
    plural: "People",
    icon: "👤",
    color: "#5B7DB1",
    description: "A human being — contacts, colleagues, clients, authors.",
    aliases: ["people", "contact", "individual", "human"],
    fields: [
      { key: "role", label: "Role", type: "text", aliases: ["title", "job_title", "position"] },
      { key: "email", label: "Email", type: "text", aliases: ["email_address", "sender_email"] },
      { key: "phone", label: "Phone", type: "text", aliases: ["phone_number", "tel"] },
    ],
    relations: [
      { predicate: "works_for", label: "works for", targetKind: "company", aliases: ["employed_by", "works_at", "affiliation"] },
      { predicate: "knows", label: "knows", targetKind: "person", aliases: ["connected_to"] },
    ],
    builtin: true,
  },
  {
    kind: "company",
    label: "Company",
    plural: "Companies",
    icon: "🏢",
    color: "#E8795A",
    description: "An organization — vendors, clients, employers, institutions.",
    aliases: ["org", "organization", "organisation", "business", "vendor", "employer", "institution"],
    fields: [
      { key: "industry", label: "Industry", type: "text", aliases: ["sector"] },
      { key: "website", label: "Website", type: "text", aliases: ["url", "site", "domain"] },
    ],
    relations: [
      { predicate: "parent_of", label: "parent of", targetKind: "company", aliases: ["owns", "subsidiary"] },
    ],
    builtin: true,
  },
  {
    kind: "invoice",
    label: "Invoice",
    plural: "Invoices",
    icon: "🧾",
    color: "#C9A23F",
    description: "A bill or invoice — an amount someone owes or is owed.",
    aliases: ["bill", "receipt"],
    fields: [
      { key: "amount", label: "Amount", type: "number", unit: "USD", required: true, aliases: ["invoice_amount", "total", "total_amount", "sum"] },
      { key: "due_date", label: "Due date", type: "date", aliases: ["due", "payable_by", "payment_due"] },
      { key: "status", label: "Status", type: "text", aliases: ["payment_status"] },
      { key: "invoice_no", label: "Invoice no", type: "text", aliases: ["invoice_number", "number", "reference"] },
    ],
    relations: [
      { predicate: "issued_by", label: "issued by", targetKind: "company", aliases: ["from", "issuer", "sender"] },
      { predicate: "billed_to", label: "billed to", aliases: ["to", "recipient", "client"] },
    ],
    builtin: true,
  },
  {
    kind: "document",
    label: "Document",
    plural: "Documents",
    icon: "📄",
    color: "#6B8E6B",
    description: "A file — PDFs, papers, contracts, reports, spreadsheets that arrived as attachments.",
    aliases: ["file", "pdf", "paper", "article", "report", "attachment", "contract"],
    fields: [
      { key: "title", label: "Title", type: "text", aliases: ["name", "document_title"] },
      { key: "author", label: "Author", type: "text", aliases: ["written_by", "authors"] },
      { key: "file_type", label: "File type", type: "text" },
      { key: "file_size", label: "File size", type: "number", unit: "bytes" },
      { key: "indexed", label: "Indexed", type: "text" },
    ],
    relations: [
      { predicate: "mentions", label: "mentions", aliases: ["references", "cites"] },
      { predicate: "about", label: "about", targetKind: "concept", aliases: ["topic", "subject_of"] },
    ],
    builtin: true,
  },
  {
    kind: "event",
    label: "Event",
    plural: "Events",
    icon: "📅",
    color: "#8B6BAE",
    description: "Something that happens at a time — meetings, trips, deadlines, launches.",
    aliases: ["meeting", "appointment", "trip", "deadline"],
    fields: [
      { key: "date", label: "Date", type: "date", aliases: ["when", "event_date", "scheduled_for"] },
      { key: "location", label: "Location", type: "text", aliases: ["place", "where", "venue"] },
    ],
    relations: [
      { predicate: "attended_by", label: "attended by", targetKind: "person", aliases: ["participants", "with"] },
      { predicate: "organized_by", label: "organized by", aliases: ["host", "hosted_by"] },
    ],
    builtin: true,
  },
  {
    kind: "note",
    label: "Note",
    plural: "Notes",
    icon: "📝",
    color: "#8E6B4A",
    description:
      "A write-up WE distilled from something the user dumped — braindumps, meeting notes, plans, ideas. Generated, never hand-authored.",
    aliases: ["memo", "braindump", "journal", "minutes"],
    fields: [],
    relations: [
      { predicate: "mentions", label: "mentions", aliases: ["references"] },
      { predicate: "about", label: "about", targetKind: "concept", aliases: ["topic"] },
    ],
    builtin: true,
  },
  {
    kind: "concept",
    label: "Concept",
    plural: "Concepts",
    icon: "💡",
    color: "#4A8E8B",
    description: "A topic or idea content can be about — used sparingly, preferring existing concepts over new ones.",
    aliases: ["topic", "theme", "subject", "idea"],
    fields: [{ key: "definition", label: "Definition", type: "text", aliases: ["description", "meaning"] }],
    relations: [{ predicate: "related_to", label: "related to", targetKind: "concept", aliases: ["similar_to", "see_also"] }],
    builtin: true,
  },
];

// --- Normalization helpers ----------------------------------------------------

/** snake_case a kind or predicate name the LLM produced. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface KindIndex {
  byName: Map<string, KindDef>; // canonical slug + every alias → kind
  predicateByKind: Map<string, Map<string, string>>; // kind → (alias → canonical predicate)
}

/** Build the lookup index once per extraction. */
export function indexKinds(kinds: KindDef[]): KindIndex {
  const byName = new Map<string, KindDef>();
  const predicateByKind = new Map<string, Map<string, string>>();
  for (const k of kinds) {
    byName.set(slugify(k.kind), k);
    if (k.plural) byName.set(slugify(k.plural), k);
    for (const a of k.aliases) byName.set(slugify(a), k);
    const preds = new Map<string, string>();
    for (const f of k.fields) {
      preds.set(slugify(f.key), f.key);
      for (const a of f.aliases ?? []) preds.set(slugify(a), f.key);
    }
    for (const r of k.relations) {
      preds.set(slugify(r.predicate), r.predicate);
      for (const a of r.aliases ?? []) preds.set(slugify(a), r.predicate);
    }
    predicateByKind.set(k.kind, preds);
  }
  return { byName, predicateByKind };
}

/** Canonical kind slug for whatever the LLM called it ("Org" → "company");
 *  unknown kinds pass through slugified (free-form stays allowed). */
export function canonicalKind(kind: string, idx: KindIndex): string {
  const slug = slugify(kind || "thing") || "thing";
  return idx.byName.get(slug)?.kind ?? slug;
}

/** Canonical predicate within a kind ("invoice_amount" → "amount");
 *  off-template predicates pass through slugified. */
export function canonicalPredicate(kind: string, predicate: string, idx: KindIndex): string {
  const slug = slugify(predicate);
  return idx.predicateByKind.get(kind)?.get(slug) ?? slug;
}

/**
 * Canonicalize one extraction against the registry: collapse kind synonyms,
 * then collapse each fact's predicate through its SUBJECT's template. Pure —
 * returns a new Extraction; never drops anything.
 */
export function canonicalizeExtraction(extraction: Extraction, kinds: KindDef[]): Extraction {
  const idx = indexKinds(kinds);
  const entities = extraction.entities.map((e) => ({ ...e, kind: canonicalKind(e.kind, idx) }));
  const kindByLocal = new Map(entities.map((e) => [e.localId, e.kind]));
  const facts = extraction.facts.map((f) => ({
    ...f,
    predicate: canonicalPredicate(kindByLocal.get(f.subjectLocalId) ?? "thing", f.predicate, idx),
  }));
  return { entities, facts };
}

// --- Template restraint (documents) ---------------------------------------------

export interface RestrictResult {
  extraction: Extraction;
  droppedFacts: number;
  droppedEntities: number;
  /** Facts dropped ONLY because their predicate is outside the subject kind's
   *  template vocabulary — the reviewable drops. Concept-leash drops (capped or
   *  kind-named concepts) are policy, not candidates, and are NOT included. */
  offTemplate: ExtractedFact[];
}

/**
 * Restrain a DOCUMENT extraction to the vocabulary its templates define.
 * Messages stay free-range (templates steer, never block), but a document's
 * full text survives elsewhere (chunks + summary + the original blob), so
 * dropping incidental triples here loses nothing irrecoverable — it kills the
 * noise star-clusters at the source.
 *
 * Rules (expects a canonicalized extraction):
 * - a fact whose subject's kind HAS a template must use a template field or
 *   relation predicate; off-template facts drop from the extraction but are
 *   RETURNED in `offTemplate` so the caller can route them to the Review
 *   queue (accept = add anyway). Kinds with no template pass through untouched.
 * - at most `maxConcepts` concept entities survive (in order of appearance);
 *   facts touching dropped concepts drop with them.
 * - a concept whose label just names a registry KIND ("invoice", "person")
 *   drops: category membership is the node's `kind` column, never an edge —
 *   otherwise every invoice would hub-link to one giant "invoice" topic node.
 * - entities survive if they are the primary subject (first listed), a kept
 *   concept, or touched by a kept fact.
 */
export function restrictExtractionToTemplates(
  extraction: Extraction,
  kinds: KindDef[],
  opts: { maxConcepts?: number } = {},
): RestrictResult {
  const maxConcepts = opts.maxConcepts ?? 3;
  const idx = indexKinds(kinds);
  const byLocal = new Map(extraction.entities.map((e) => [e.localId, e]));
  const allowedByKind = new Map<string, Set<string>>(
    kinds.map((k) => [
      k.kind,
      new Set([...k.fields.map((f) => f.key), ...k.relations.map((r) => r.predicate)]),
    ]),
  );

  const keptConcepts = new Set<string>();
  for (const e of extraction.entities) {
    if (e.kind !== "concept" || keptConcepts.size >= maxConcepts) continue;
    if (idx.byName.has(slugify(e.label))) continue; // names a kind → fake hub
    keptConcepts.add(e.localId);
  }
  const conceptDropped = (localId: string) => {
    const e = byLocal.get(localId);
    return e?.kind === "concept" && !keptConcepts.has(localId);
  };

  const offTemplate: ExtractedFact[] = [];
  const facts = extraction.facts.filter((f) => {
    const subj = byLocal.get(f.subjectLocalId);
    if (!subj) return false;
    if (conceptDropped(f.subjectLocalId)) return false;
    if (f.value.kind === "entity" && conceptDropped(f.value.entityLocalId)) return false;
    const allowed = allowedByKind.get(subj.kind);
    if (allowed && !allowed.has(f.predicate)) {
      offTemplate.push(f); // dropped by the template — reviewable, not lost
      return false;
    }
    return true;
  });

  const touched = new Set<string>();
  for (const f of facts) {
    touched.add(f.subjectLocalId);
    if (f.value.kind === "entity") touched.add(f.value.entityLocalId);
  }
  const entities = extraction.entities.filter((e, i) => {
    if (e.kind === "concept") return keptConcepts.has(e.localId);
    return i === 0 || touched.has(e.localId);
  });
  const keptIds = new Set(entities.map((e) => e.localId));
  const finalFacts = facts.filter(
    (f) => keptIds.has(f.subjectLocalId) && (f.value.kind !== "entity" || keptIds.has(f.value.entityLocalId)),
  );

  return {
    extraction: { entities, facts: finalFacts },
    droppedFacts: extraction.facts.length - finalFacts.length,
    droppedEntities: extraction.entities.length - entities.length,
    offTemplate,
  };
}

// --- Off-template review payload (documents) -------------------------------------

export interface OffTemplateDisplayFact {
  subject: string;
  subjectKind: string;
  predicate: string;
  value: string;
  /** Value is a relationship to another entity. */
  ref: boolean;
}

export interface OffTemplateReviewPayload {
  /** Self-contained replay: exactly the off-template facts + the entities they
   *  touch. Accepting the review ingests THIS through the normal pipeline. */
  extraction: Extraction;
  /** Pre-rendered lines for the review card (no interpretation needed later). */
  display: OffTemplateDisplayFact[];
}

/**
 * Package restraint drops as a reviewable, replayable unit. Entities come from
 * the PRE-restriction extraction (the restricted one may have dropped them);
 * facts are the off-template drops verbatim. Null when there's nothing to file.
 */
export function buildOffTemplateReview(
  original: Extraction,
  offTemplate: ExtractedFact[],
): OffTemplateReviewPayload | null {
  if (offTemplate.length === 0) return null;
  const byLocal = new Map(original.entities.map((e) => [e.localId, e]));

  const needed = new Set<string>();
  const facts = offTemplate.filter((f) => {
    const subj = byLocal.get(f.subjectLocalId);
    if (!subj) return false;
    if (f.value.kind === "entity" && !byLocal.has(f.value.entityLocalId)) return false;
    needed.add(f.subjectLocalId);
    if (f.value.kind === "entity") needed.add(f.value.entityLocalId);
    return true;
  });
  if (facts.length === 0) return null;

  const entities: ExtractedEntity[] = original.entities.filter((e) => needed.has(e.localId));
  const labelOf = (localId: string) => byLocal.get(localId)?.label ?? "?";
  const display: OffTemplateDisplayFact[] = facts.map((f) => {
    const subj = byLocal.get(f.subjectLocalId)!;
    const v = f.value;
    const value =
      v.kind === "entity" ? labelOf(v.entityLocalId)
      : v.kind === "number" ? `${v.num}${v.unit ? " " + v.unit : ""}`
      : v.kind === "date" ? v.date
      : v.text;
    return { subject: subj.label, subjectKind: subj.kind, predicate: f.predicate, value, ref: v.kind === "entity" };
  });

  return { extraction: { entities, facts }, display };
}

// --- Prompt rendering -----------------------------------------------------------

/** Render the user's categories as a compact prompt section the extractor
 *  can follow: kind, when to use it, field keys (typed) and relation verbs. */
export function promptCategories(kinds: KindDef[]): string {
  if (kinds.length === 0) return "";
  const lines = kinds.map((k) => {
    const fields = k.fields
      .map((f) => `${f.key}(${f.type}${f.unit ? " " + f.unit : ""}${f.required ? ", required" : ""})`)
      .join(", ");
    const rels = k.relations.map((r) => `${r.predicate}${r.targetKind ? "→" + r.targetKind : ""}`).join(", ");
    const parts = [k.description ? `${k.description}` : null, fields ? `fields: ${fields}` : null, rels ? `relations: ${rels}` : null]
      .filter(Boolean)
      .join(" · ");
    return `- ${k.kind}: ${parts}`;
  });
  return (
    "The user's CATEGORIES. When an entity fits one, use its kind and its exact field/relation names as predicates. " +
    "If nothing fits, use a sensible lowercase kind of your own.\n" +
    lines.join("\n")
  );
}

/** Render just the category MENU (no field details) — what the cheap document
 *  classifier chooses from. */
export function promptCategoryMenu(kinds: KindDef[]): string {
  return kinds.map((k) => `- ${k.kind}: ${k.description ?? k.label}`).join("\n");
}

/** How much of the document the classifier reads. */
export const CLASSIFY_EXCERPT_CHARS = 2000;

/** The user prompt for the cheap document-classification call (①). */
export function buildClassifyPrompt(args: {
  filename?: string | null;
  text: string;
  kinds: KindDef[];
}): string {
  return [
    `Categories:\n${promptCategoryMenu(args.kinds)}`,
    `Document${args.filename ? ` "${args.filename}"` : ""} (beginning):\n${args.text.slice(0, CLASSIFY_EXCERPT_CHARS)}`,
    `Which single category best describes what this document IS?`,
  ].join("\n\n");
}

export interface DocumentPromptInput {
  text: string;
  filename?: string | null;
  /** Pre-classified category (registry slug); focuses the prompt on that
   *  kind's template. Null/unknown falls back to the full category menu. */
  docKind?: string | null;
  businessContext?: string | null;
  kinds?: KindDef[];
  concepts?: string[];
}

/** The user prompt for the focused document extraction call (②). */
export function buildDocumentPrompt(input: DocumentPromptInput): string {
  const parts: string[] = [];
  const kind = input.kinds?.find((k) => k.kind === input.docKind);
  if (kind) parts.push(promptKindTemplate(kind));
  else if (input.kinds?.length) parts.push(promptCategories(input.kinds));
  if (input.concepts?.length) {
    parts.push(
      `The user's existing CONCEPTS (topics): ${input.concepts.join(", ")}.\n` +
        "STRONGLY prefer these exact labels; invent a new concept only when the document is clearly about something not listed.",
    );
  }
  if (input.businessContext) parts.push(`About the user's work: ${input.businessContext}`);
  if (input.filename) parts.push(`Filename: ${input.filename}`);
  parts.push(`\nDocument text:\n${input.text}`);
  return parts.join("\n\n");
}

/** Render ONE kind's template as the focused extraction vocabulary for a
 *  document already classified into it. */
export function promptKindTemplate(kind: KindDef): string {
  const fields = kind.fields
    .map((f) => `${f.key} (${f.type}${f.unit ? ", " + f.unit : ""}${f.required ? ", required" : ""})`)
    .join(", ");
  const rels = kind.relations
    .map((r) => `${r.predicate}${r.targetKind ? " → a " + r.targetKind : ""}`)
    .join(", ");
  return [
    `The document's PRIMARY SUBJECT is a ${kind.kind}${kind.description ? ` (${kind.description})` : ""}.`,
    fields ? `Its template fields — the ONLY attribute predicates to use: ${fields}.` : null,
    rels ? `Its relation verbs — the ONLY relationship predicates to use: ${rels}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
