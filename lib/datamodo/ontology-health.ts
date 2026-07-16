import type { KindDef } from "./ontology";

// ONTOLOGY HEALTH pure core (GRAPH_PIPELINE.md P2) — vocabulary telemetry
// over the graph: per-kind Ontology Conformance (share of current facts whose
// predicate is template vocabulary), new-predicate rate, and the growth gate
// (hot off-template predicates → field proposals). No Prisma, no LLM — the
// DB shell lives in analytics.ts and the proposal filing in consolidate.ts;
// unit tests in tests/ontology-health.test.ts.
//
// Metrics follow the extraction-QA literature (§10b of the doc): conformance
// counts aliases as conforming (an alias IS canonicalized on write — seeing
// one here means it predates the alias or slipped through), and first-seen
// dates derive from created_at over ALL facts (superseded rows included),
// which works because facts are append-only.

/** One fact, projected to what telemetry needs. */
export interface HealthFact {
  predicate: string;
  /** The subject entity's kind (registry slug or free-form). */
  subjectKind: string;
  createdAt: Date;
  /** valid_to IS NULL — only current facts count toward conformance. */
  current: boolean;
  valueType: "text" | "number" | "date" | "entity";
  unit?: string | null;
}

/** Predicates the PIPELINE itself emits on any kind — never "sprawl". */
export const UNIVERSAL_PREDICATES = new Set([
  "mentions",
  "about",
  "original_filename",
]);

export interface KindHealth {
  kind: string;
  /** Current facts whose subject is this kind. */
  factCount: number;
  distinctPredicates: number;
  /** 0..1 share of current facts using template vocabulary (fields +
   *  relations + their aliases + universal predicates). Null when the kind
   *  isn't in the registry — there is no template to conform to. */
  conformance: number | null;
  /** Predicates whose first-EVER appearance is inside the window. */
  newPredicates: string[];
  /** Off-template predicates by current-fact count, descending (capped). */
  offTemplate: { predicate: string; count: number; valueType: HealthFact["valueType"] }[];
}

export interface OntologyHealth {
  kinds: KindHealth[];
  overall: {
    /** Conformance across registry kinds only (null = no facts on any). */
    conformance: number | null;
    distinctPredicates: number;
    newPredicates: number;
    windowDays: number;
  };
}

/** The template vocabulary for one kind: field keys, relation predicates,
 *  and every alias of both. */
export function templateVocabulary(def: KindDef): Set<string> {
  const vocab = new Set<string>();
  for (const f of def.fields) {
    vocab.add(f.key);
    for (const a of f.aliases ?? []) vocab.add(a);
  }
  for (const r of def.relations) {
    vocab.add(r.predicate);
    for (const a of r.aliases ?? []) vocab.add(a);
  }
  return vocab;
}

const OFF_TEMPLATE_CAP = 8;

export function computeOntologyHealth(
  facts: HealthFact[],
  kinds: KindDef[],
  now: Date,
  opts: { windowDays?: number } = {},
): OntologyHealth {
  const windowDays = opts.windowDays ?? 7;
  const windowStart = now.getTime() - windowDays * 86_400_000;
  const vocabByKind = new Map(kinds.map((k) => [k.kind, templateVocabulary(k)]));

  // First-ever appearance of each (kind, predicate) — over ALL facts.
  const firstSeen = new Map<string, number>();
  for (const f of facts) {
    const key = `${f.subjectKind}::${f.predicate}`;
    const t = f.createdAt.getTime();
    const prev = firstSeen.get(key);
    if (prev === undefined || t < prev) firstSeen.set(key, t);
  }

  interface Acc {
    factCount: number;
    predicates: Set<string>;
    conforming: number;
    offCounts: Map<string, { count: number; valueType: HealthFact["valueType"] }>;
  }
  const byKind = new Map<string, Acc>();
  for (const f of facts) {
    if (!f.current) continue;
    let acc = byKind.get(f.subjectKind);
    if (!acc) {
      acc = { factCount: 0, predicates: new Set(), conforming: 0, offCounts: new Map() };
      byKind.set(f.subjectKind, acc);
    }
    acc.factCount++;
    acc.predicates.add(f.predicate);
    const vocab = vocabByKind.get(f.subjectKind);
    const conforms = UNIVERSAL_PREDICATES.has(f.predicate) || (vocab?.has(f.predicate) ?? false);
    if (conforms) acc.conforming++;
    else if (vocab) {
      const off = acc.offCounts.get(f.predicate);
      if (off) off.count++;
      else acc.offCounts.set(f.predicate, { count: 1, valueType: f.valueType });
    }
  }

  const out: KindHealth[] = [];
  let regFacts = 0;
  let regConforming = 0;
  const allPredicates = new Set<string>();
  let newTotal = 0;
  for (const [kind, acc] of byKind) {
    const inRegistry = vocabByKind.has(kind);
    if (inRegistry) {
      regFacts += acc.factCount;
      regConforming += acc.conforming;
    }
    for (const p of acc.predicates) allPredicates.add(p);
    const fresh = [...acc.predicates]
      .filter((p) => (firstSeen.get(`${kind}::${p}`) ?? 0) >= windowStart)
      .sort();
    newTotal += fresh.length;
    out.push({
      kind,
      factCount: acc.factCount,
      distinctPredicates: acc.predicates.size,
      conformance: inRegistry ? (acc.factCount ? acc.conforming / acc.factCount : 1) : null,
      newPredicates: fresh,
      offTemplate: [...acc.offCounts.entries()]
        .map(([predicate, v]) => ({ predicate, count: v.count, valueType: v.valueType }))
        .sort((a, b) => b.count - a.count || a.predicate.localeCompare(b.predicate))
        .slice(0, OFF_TEMPLATE_CAP),
    });
  }
  // Worst conformance first (nulls last), then by size — the card reads as a
  // triage list.
  out.sort((a, b) => {
    if (a.conformance === null && b.conformance === null) return b.factCount - a.factCount;
    if (a.conformance === null) return 1;
    if (b.conformance === null) return -1;
    return a.conformance - b.conformance || b.factCount - a.factCount;
  });

  return {
    kinds: out,
    overall: {
      conformance: regFacts ? regConforming / regFacts : null,
      distinctPredicates: allPredicates.size,
      newPredicates: newTotal,
      windowDays,
    },
  };
}

// --- The growth gate: hot off-template predicates → field proposals ---------

export interface FieldProposal {
  /** Registry kind slug the field would be added to. */
  kind: string;
  predicate: string;
  /** Current facts already using it. */
  count: number;
  /** Majority value type — decides field type vs relation. */
  valueType: HealthFact["valueType"];
  /** Entity-valued predicates become template RELATIONS, not fields. */
  asRelation: boolean;
  unit?: string;
}

/** Off-template predicates in heavy enough use that the template should
 *  probably grow. Deterministic; the caller excludes already-asked pairs and
 *  files the reviews. */
export function proposeFieldAdditions(
  facts: HealthFact[],
  kinds: KindDef[],
  opts: { minCount?: number; maxPerKind?: number } = {},
): FieldProposal[] {
  const minCount = opts.minCount ?? 3;
  const maxPerKind = opts.maxPerKind ?? 2;
  const vocabByKind = new Map(kinds.map((k) => [k.kind, templateVocabulary(k)]));

  const acc = new Map<string, { count: number; types: Map<HealthFact["valueType"], number>; units: Map<string, number> }>();
  for (const f of facts) {
    if (!f.current) continue;
    const vocab = vocabByKind.get(f.subjectKind);
    if (!vocab) continue; // unregistered kind → category_proposal territory
    if (vocab.has(f.predicate) || UNIVERSAL_PREDICATES.has(f.predicate)) continue;
    const key = `${f.subjectKind}::${f.predicate}`;
    let a = acc.get(key);
    if (!a) {
      a = { count: 0, types: new Map(), units: new Map() };
      acc.set(key, a);
    }
    a.count++;
    a.types.set(f.valueType, (a.types.get(f.valueType) ?? 0) + 1);
    if (f.unit) a.units.set(f.unit, (a.units.get(f.unit) ?? 0) + 1);
  }

  const majority = <T>(m: Map<T, number>): T | undefined =>
    [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const perKind = new Map<string, number>();
  const out: FieldProposal[] = [];
  const ranked = [...acc.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  for (const [key, a] of ranked) {
    if (a.count < minCount) continue;
    const [kind, predicate] = key.split("::");
    const used = perKind.get(kind) ?? 0;
    if (used >= maxPerKind) continue;
    perKind.set(kind, used + 1);
    const valueType = majority(a.types) ?? "text";
    out.push({
      kind,
      predicate,
      count: a.count,
      valueType,
      asRelation: valueType === "entity",
      unit: majority(a.units),
    });
  }
  return out;
}
