import { prisma } from "@/lib/prisma";
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
}
export interface InferredGraph {
  schema: InferredSchema;
  extractions: Extraction[];
  subjectLabels: string[];
  referencedLabels: string[];
  factCount: number;
}
export interface InferInput { tableName: string; columns: DatasetColumn[]; rows: Record<string, unknown>[] }

export function inferGraphFromTable(input: InferInput, opts: { knownLabels?: Set<string> } = {}): InferredGraph {
  const { tableName, columns, rows } = input;
  const known = opts.knownLabels ?? new Set<string>();
  const entityKind = kindFrom(tableName);

  // Subject = the row's identity. Spreadsheets lead with it, so take the first
  // text column that isn't obviously a reference; fall back to the first column.
  const textCols = columns.filter((c) => valueType(c.type) === "text");
  const subject = textCols.find((c) => !REF_COL.test(c.key) && !REF_COL.test(c.label)) ?? textCols[0] ?? columns[0];

  const distinctVals = (key: string) => {
    const s = new Set<string>();
    for (const r of rows) { const n = normLow(r[key]); if (n) s.add(n); }
    return s;
  };

  const references: InferredRef[] = [];
  const attributes: InferredAttr[] = [];
  for (const c of columns) {
    if (!subject || c.key === subject.key) continue;
    const vt = valueType(c.type);
    let isRef = false;
    if (vt === "text") {
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
    if (isRef) references.push({ column: c.key, label: c.label, kind: kindFrom(c.label) });
    else attributes.push({ column: c.key, label: c.label, valueType: vt });
  }

  const schema: InferredSchema = {
    entityKind,
    subjectColumn: subject?.key ?? "",
    subjectLabel: subject?.label ?? "",
    references,
    attributes,
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

export interface ImportGraphResult {
  schema: InferredSchema;
  rowsProcessed: number;
  entitiesCreated: number;
  entitiesResolved: number;
  factsNew: number;
  factsDeduped: number;
}

/** Infer a graph from a table and merge every row into the existing knowledge
 *  graph via `ingestExtraction` (resolution + dedup + bitemporal). */
export async function importTableAsGraph(
  orgId: string,
  ownerUserId: string | null,
  input: InferInput,
): Promise<ImportGraphResult> {
  // Existing entity labels feed reference detection (a column of known entities
  // is a relationship, even without a telltale name).
  const data = await prisma.entities.findMany({
    where: { org_id: orgId, merged_into: null },
    select: { canonical_label: true },
  });
  const knownLabels = new Set(data.map((e) => e.canonical_label.trim().toLowerCase()));

  const inferred = inferGraphFromTable(input, { knownLabels });

  // Lazy import so the pure inference above stays free of knowledge.ts's runtime deps.
  const { ingestExtraction } = await import("./knowledge");
  const totals = { entitiesCreated: 0, entitiesResolved: 0, factsNew: 0, factsDeduped: 0 };
  for (const ex of inferred.extractions) {
    const r = await ingestExtraction(orgId, ownerUserId, null, ex);
    totals.entitiesCreated += r.entitiesCreated;
    totals.entitiesResolved += r.entitiesResolved;
    totals.factsNew += r.factsNew;
    totals.factsDeduped += r.factsDeduped;
  }
  return { schema: inferred.schema, rowsProcessed: inferred.extractions.length, ...totals };
}
