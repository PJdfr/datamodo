import { CSSProperties } from "react";

export type ChangeOp = "new" | "update" | "merge" | "link" | "remove";

export interface ChangeField {
  label: string;
  /** Previous value; null/undefined = newly added field (renders as +add). */
  from?: string | null;
  /** New value. */
  to: string;
}

export interface ChangeSource {
  name: string;
  /** Origin channel label (Gmail, WhatsApp, Slack, Teams…). */
  channel: string;
  time: string;
}

export interface SuggestedChange {
  id: string;
  op: ChangeOp;
  /** The record/entity affected, e.g. "Acme Inc". */
  entity: string;
  /** Where it lands: "Companies", "Invoices", "Knowledge graph"… */
  table: string;
  source: ChangeSource;
  /** 0..1 extraction confidence. */
  confidence: number;
  /** Field-level diff (for new/update/remove). */
  fields?: ChangeField[];
  /** One-line summary with **bold** / *italic* — for link/merge. */
  summary?: string;
}

/**
 * The review / versioning queue: datamodo proposes changes to your database
 * (new records, field updates, merges, graph links, removals) pulled from your
 * messages, each with provenance + confidence; you Accept or Reject. Accepting
 * collapses the card into a green committed strip (with Undo); "Accept all"
 * clears the queue, staggered. A sample datamodo queue is built in.
 *
 * @dsCard directory card lives in components/review/review.card.html
 * @startingPoint section="Review" subtitle="Accept/reject suggested DB & graph changes" viewport="460x640"
 */
export interface ChangeReviewProps {
  /** Changes to review. Defaults to a sample datamodo queue. */
  changes?: SuggestedChange[];
  /** Panel heading. Default "Suggested changes". */
  title?: string;
  /** Fires when a change is accepted or rejected. */
  onResolve?: (id: string, action: "accepted" | "rejected") => void;
  style?: CSSProperties;
}

export function ChangeReview(props: ChangeReviewProps): JSX.Element;
