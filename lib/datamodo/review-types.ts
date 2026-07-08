// Shared VIEW MODELS for the knowledge review queue — the single contract the
// server (lib/datamodo/reviews.ts) produces and the UI (app/dashboard/
// review-studio.tsx) renders. Types only, no runtime deps, so the client bundle
// stays clean. Each kind carries exactly the structured fields its card needs;
// the API returns this shape and the tab's simulated data conforms to it too.

export type ReviewKind = "entity_merge" | "fact_conflict" | "extraction" | "table_change";

export interface EntityAttr {
  k: string;
  v: string;
}

export interface ReviewEntitySide {
  label: string;
  type: string; // entity kind: person | org | invoice | ...
  attrs: EntityAttr[];
  source?: string;
}

export interface ReviewFact {
  s: string; // subject label
  p: string; // predicate
  v: string; // value (or target label when ref)
  c: number; // confidence 0..1
  ref?: boolean; // value is a relationship to another entity
}

interface ReviewBase {
  id: string;
  confidence: number | null;
  impact: number;
  createdAt: string;
}

/** "Are these two the same thing?" */
export interface MergeReview extends ReviewBase {
  kind: "entity_merge";
  parsed: ReviewEntitySide; // the newly-parsed name
  canonical: ReviewEntitySide; // the existing entity we'd merge into
  reason: string; // why the resolver thinks they match
}

/** "A newer message disagrees with a value we had." */
export interface ConflictReview extends ReviewBase {
  kind: "fact_conflict";
  subject: string;
  field: string;
  was: string;
  now: string;
  wasSource: string;
  nowSource: string;
  note: string;
}

/** "Did we understand this message correctly?" (low-confidence extractions) */
export interface ExtractionReview extends ReviewBase {
  kind: "extraction";
  from: string;
  channel: string;
  snippet: string;
  entities: { label: string; type: string }[];
  facts: ReviewFact[];
}

/** A proposed change to a user TABLE (a dataset_rows add/update), folded into the
 *  unified review queue. Bridges the older Versioning surface into Review. */
export interface TableCell {
  label: string;
  before?: string;
  after: string;
}
export interface TableChangeReview extends ReviewBase {
  kind: "table_change";
  changeKind: "add" | "update";
  conflict: boolean;
  table: string;
  agent: string;
  sourceLabel: string | null;
  cells: TableCell[];
}

export type ReviewItem = MergeReview | ConflictReview | ExtractionReview | TableChangeReview;
