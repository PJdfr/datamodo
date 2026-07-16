// Shared VIEW MODELS for the knowledge review queue — the single contract the
// server (lib/datamodo/reviews.ts) produces and the UI (app/dashboard/
// review-studio.tsx) renders. Types only, no runtime deps, so the client bundle
// stays clean. Each kind carries exactly the structured fields its card needs;
// the API returns this shape and the tab's simulated data conforms to it too.

export type ReviewKind = "entity_merge" | "fact_conflict" | "extraction" | "off_template" | "category_proposal" | "orphan_prune";

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

/** "A document said things its category template doesn't cover — keep them?"
 *  Nothing is applied until accepted (unlike the other kinds). */
export interface OffTemplateReview extends ReviewBase {
  kind: "off_template";
  docLabel: string; // the document the facts came from
  docKind: string | null; // its classified category, when known
  facts: ReviewFact[];
}

/** "You keep capturing things no category covers — make one?" (growth loop ⑤)
 *  Accepting CREATES the category with the drafted template; nothing else is
 *  applied. The entities that triggered it already exist and keep their kind. */
export interface CategoryProposalReview extends ReviewBase {
  kind: "category_proposal";
  proposedKind: string; // the slug those entities already carry
  label: string;
  count: number; // entities of this kind today
  sampleLabels: string[];
  fields: { key: string; label: string; type: string }[];
  relations: { predicate: string; label: string; targetKind?: string }[];
  icon?: string;
  description?: string;
}

/** "These strays are linked to nothing — prune them?" (consolidation pass)
 *  Nothing is applied until accepted; declining never re-asks about the same
 *  entities. Accept deletes only entities STILL unlinked at accept time. */
export interface OrphanPruneReview extends ReviewBase {
  kind: "orphan_prune";
  count: number;
  /** Display sample (capped at filing time); ids live in the review detail. */
  entities: { label: string; type: string }[];
}

export type ReviewItem = MergeReview | ConflictReview | ExtractionReview | OffTemplateReview | CategoryProposalReview | OrphanPruneReview;
