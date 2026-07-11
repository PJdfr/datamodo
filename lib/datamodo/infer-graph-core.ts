import type { DatasetColumn } from "./types";
import type { Extraction, ExtractedEntity, ExtractedFact } from "./knowledge";

/**
 * Infer a knowledge graph from a table (a spreadsheet or an existing dataset) and
 * MERGE it into the user's existing graph. The inference is a pure, deterministic
 * heuristic — no LLM — that turns each row into an `Extraction` (a subject entity
 * + attribute facts + relationship facts to referenced entities). Merging then
 * reuses the same `ingestExtraction` machinery as message extraction, so entity
 * resolution, fact dedup, and bitemporal versioning all apply for free.
 *
 * Why encourage this at onboarding (see PROJECT_STATE): resolving a table's rows
 * against a LARGE existing graph is far costlier than seeding while it's fresh —
 * every subject/reference must be compared against everything already there.
 */

// ---- kind + singularization heuristics -----------------------------------

const IRREGULAR_SINGULAR: Record<string, string> = { people: "person", companies: "company", entries: "entry", parties: "party" };
export function singularize(word: string): string {
  const k = word.toLowerCase().trim();
  if (IRREGULAR_SINGULAR[k]) return IRREGULAR_SINGULAR[k];
  if (/ies$/.test(k)) return k.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/.test(k)) return k.slice(0, -2);
  if (/s$/.test(k) && !/ss$/.test(k)) return k.slice(0, -1);
  return k;
}

// Map a table/column name to a canonical entity kind (aligns with the kinds the
// rest of the app + seed use: person / company / invoice / …).
const KIND_RULES: [RegExp, string][] = [
  [/contact|people|person|lead|customer|client|attendee|member|guest|travel|passenger|employee|staff|owner|manager|assignee|host|recipient/, "person"],
  [/compan|vendor|supplier|account|organi|\borg\b|business|firm|brand|studio|agency/, "company"],
  [/invoice|\bbill\b/, "invoice"],
  [/payment|expense|transaction|receipt/, "payment"],
  [/product|item|sku|asset/, "product"],
  [/project|deal|opportunity|engagement|campaign/, "project"],
  [/order|shipment|delivery/, "order"],
  [/task|ticket|issue/, "task"],
];
export function kindFrom(name: string): string {
  const n = name.toLowerCase();
  for (const [re, k] of KIND_RULES) if (re.test(n)) return k;
  return singularize(name) || "record";
}

// A text column whose values name ANOTHER entity → a relationship, not an attribute.
const REF_COL = /company|client|vendor|account|organi|org|person|contact|owner|assignee|customer|supplier|manager|lead|attendee|traveler|traveller|host|recipient|(^|_)by$|^for$|(^|_)from$|(^|_)to$/i;
// Id-ish columns become natural keys — they drive resolution/dedup on merge.
const NK_RULES: [RegExp, string][] = [
  [/^e?mail$|_email$/, "email"],
  [/phone|mobile|^tel$/, "phone"],
  [/invoice.*(no|num|#)|^invoice$|^inv$/, "invoice_no"],
  [/^id$|_id$|reference|ref_no|^ref$/, "external_id"],
];
function naturalKeyOf(col: DatasetColumn): string | null {
  for (const [re, k] of NK_RULES) if (re.test(col.key) || re.test(col.label)) return k;
  return null;
}

const norm = (v: unknown) => (v == null ? "" : String(v).trim());
const normLow = (v: unknown) => norm(v).toLowerCase();
const valueType = (t: string): "text" | "number" | "date" => (t === "number" ? "number" : t === "date" ? "date" : "text");

// ---- inference output shapes ---------------------------------------------

export interface InferredRef { column: string; label: string; kind: string }
export interface InferredAttr { column: string; label: string; valueType: "text" | "number" | "date" }
export interface InferredSchema {
  entityKind: string;
  subjectColumn: string;
  subjectLabel: string;
  references: InferredRef[];
  attributes: InferredAttr[];
  /** Columns the user told us to leave out entirely. */
  skipped: string[];
}
export interface InferredGraph {
  schema: InferredSchema;
  extractions: Extraction[];
  subjectLabels: string[];
  referencedLabels: string[];
  factCount: number;
}
export interface InferInput { tableName: string; columns: DatasetColumn[]; rows: Record<string, unknown>[] }

/** The user's corrections to the inferred reading (the preview step's output).
 *  Everything is optional — the heuristics fill whatever isn't overridden. */
export interface InferOverrides {
  /** What each row IS (entity kind), e.g. "candidate". */
  entityKind?: string;
  /** Which column is each row's identity. */
  subjectColumn?: string;
  /** Per-column role corrections, keyed by column key. `kind` refines what a
   *  reference column points at; role "skip" drops the column entirely. */
  columns?: Record<string, { role: "reference" | "attribute" | "skip"; kind?: string }>;
}

export function inferGraphFromTable(
  input: InferInput,
  opts: { knownLabels?: Set<string>; overrides?: InferOverrides } = {},
): InferredGraph {
  const { tableName, columns, rows } = input;
  const known = opts.knownLabels ?? new Set<string>();
  const ov = opts.overrides ?? {};
  const entityKind = ov.entityKind?.trim().toLowerCase() || kindFrom(tableName);

  // Subject = the row's identity. The user's pick wins; otherwise spreadsheets
  // lead with it, so take the first text column that isn't obviously a
  // reference; fall back to the first column.
  const textCols = columns.filter((c) => valueType(c.type) === "text");
  const subject =
    (ov.subjectColumn ? columns.find((c) => c.key === ov.subjectColumn) : undefined) ??
    textCols.find((c) => !REF_COL.test(c.key) && !REF_COL.test(c.label)) ??
    textCols[0] ??
    columns[0];

  const distinctVals = (key: string) => {
    const s = new Set<string>();
    for (const r of rows) { const n = normLow(r[key]); if (n) s.add(n); }
    return s;
  };

  const references: InferredRef[] = [];
  const attributes: InferredAttr[] = [];
  const skipped: string[] = [];
  for (const c of columns) {
    if (!subject || c.key === subject.key) continue;
    const colOv = ov.columns?.[c.key];
    if (colOv?.role === "skip") { skipped.push(c.key); continue; }
    const vt = valueType(c.type);
    let isRef = false;
    if (colOv?.role === "reference") isRef = true;
    else if (colOv?.role === "attribute") isRef = false;
    else if (vt === "text") {
      if (REF_COL.test(c.key) || REF_COL.test(c.label)) isRef = true;
      else if (known.size) {
        const vals = distinctVals(c.key);
        if (vals.size) {
          let hit = 0;
          for (const v of vals) if (known.has(v)) hit++;
          if (hit / vals.size >= 0.5) isRef = true; // most values already are entities
        }
      }
    }
    if (isRef) references.push({ column: c.key, label: c.label, kind: colOv?.kind?.trim().toLowerCase() || kindFrom(c.label) });
    else attributes.push({ column: c.key, label: c.label, valueType: vt });
  }

  const schema: InferredSchema = {
    entityKind,
    subjectColumn: subject?.key ?? "",
    subjectLabel: subject?.label ?? "",
    references,
    attributes,
    skipped,
  };

  const nkCols = columns.filter((c) => naturalKeyOf(c));
  const extractions: Extraction[] = [];
  const subjectLabels = new Set<string>();
  const referencedLabels = new Set<string>();
  let factCount = 0;

  for (const row of rows) {
    const label = subject ? norm(row[subject.key]) : "";
    if (!label) continue; // no identity → skip the row
    subjectLabels.add(label.toLowerCase());

    const naturalKeys: Record<string, string> = {};
    for (const c of nkCols) {
      const nk = naturalKeyOf(c)!;
      const v = norm(row[c.key]);
      if (v) naturalKeys[nk] = v;
    }
    const entities: ExtractedEntity[] = [{ localId: "s", kind: entityKind, label, ...(Object.keys(naturalKeys).length ? { naturalKeys } : {}) }];
    const facts: ExtractedFact[] = [];

    let ri = 0;
    for (const ref of references) {
      const v = norm(row[ref.column]);
      if (!v) continue;
      const lid = `r${ri++}`;
      referencedLabels.add(v.toLowerCase());
      entities.push({ localId: lid, kind: ref.kind, label: v });
      facts.push({ subjectLocalId: "s", predicate: ref.column, cardinality: "one", value: { kind: "entity", entityLocalId: lid } });
      factCount++;
    }
    for (const attr of attributes) {
      const raw = row[attr.column];
      if (raw == null || raw === "") continue;
      let value: ExtractedFact["value"];
      if (attr.valueType === "number") {
        const n = Number(raw);
        if (Number.isNaN(n)) continue;
        value = { kind: "number", num: n };
      } else if (attr.valueType === "date") {
        value = { kind: "date", date: String(raw).slice(0, 10) };
      } else {
        value = { kind: "text", text: String(raw) };
      }
      facts.push({ subjectLocalId: "s", predicate: attr.column, cardinality: "one", value });
      factCount++;
    }
    extractions.push({ entities, facts });
  }

  return { schema, extractions, subjectLabels: [...subjectLabels], referencedLabels: [...referencedLabels], factCount };
}

// ---- cross-row dedupe -------------------------------------------------------

/** Rows per combined extraction — bounds one ingest call's working set while
 *  still deduping the batch's repeated references down to one resolution. */
export const COMBINE_BATCH_ROWS = 200;

/**
 * Combine several row extractions into ONE, deduping identical entities
 * (same kind + label + natural keys) to a single shared local id — so a
 * reference repeated across 200 rows ("Acme" on every invoice) is RESOLVED
 * ONCE instead of once per row. Facts are remapped; duplicate facts collapse
 * later via claim-key dedup as usual.
 */
export function combineExtractions(extractions: Extraction[]): Extraction {
  const entities: ExtractedEntity[] = [];
  const facts: ExtractedFact[] = [];
  const byIdentity = new Map<string, string>(); // kind|label|nks → shared local id

  for (let i = 0; i < extractions.length; i++) {
    const remap = new Map<string, string>();
    for (const e of extractions[i].entities) {
      const nks = e.naturalKeys && Object.keys(e.naturalKeys).length
        ? JSON.stringify(Object.entries(e.naturalKeys).sort(([a], [b]) => a.localeCompare(b)))
        : "";
      const identity = `${e.kind}|${e.label.trim().toLowerCase()}|${nks}`;
      let shared = byIdentity.get(identity);
      if (!shared) {
        shared = `c${byIdentity.size}`;
        byIdentity.set(identity, shared);
        entities.push({ ...e, localId: shared });
      }
      remap.set(e.localId, shared);
    }
    for (const f of extractions[i].facts) {
      const subj = remap.get(f.subjectLocalId);
      if (!subj) continue; // defensive: dangling ref
      if (f.value.kind === "entity") {
        const obj = remap.get(f.value.entityLocalId);
        if (!obj) continue;
        facts.push({ ...f, subjectLocalId: subj, value: { kind: "entity", entityLocalId: obj } });
      } else {
        facts.push({ ...f, subjectLocalId: subj });
      }
    }
  }
  return { entities, facts };
}

