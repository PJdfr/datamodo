import type { Extraction } from "./knowledge";

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
