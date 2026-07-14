// REVIEW PING — the pull request comes to YOU. When extraction isn't
// confident (a possible merge, an off-template doc, a low-confidence read, a
// proposed category), the pipeline files a review — and instead of waiting
// silently in the dashboard, the decision is pushed back over the channel
// the message came from: WhatsApp/Slack users reply "1 yes" / "2 no" right
// in the thread; email falls back to the review link (no outbound sender
// yet). Only when there IS something to decide — a confident extraction
// pings nothing. Pure module (no imports): message rendering + reply parsing
// unit-test here; lib/datamodo/review-inbox.ts is the DB shell and
// lib/datamodo/outbound.ts does the sending.

export interface PingQuestion {
  /** knowledge_reviews.id */
  id: string;
  /** One human sentence, already resolved ("Merge 'X' into 'Y'?"). */
  question: string;
}

/** One review row → one plain question. Labels are resolved by the shell. */
export function reviewQuestion(
  kind: string,
  detail: Record<string, unknown>,
  sourceLabel?: string | null,
  targetLabel?: string | null,
): string {
  switch (kind) {
    case "entity_merge":
      return `Merge "${(detail.parsedLabel as string) || sourceLabel || "the new one"}" into "${targetLabel ?? "the existing one"}"?`;
    case "fact_conflict":
      return `"${String(detail.predicate ?? "a fact").replace(/_/g, " ")}" changed${targetLabel ? ` on ${targetLabel}` : ""} — keep the new value?`;
    case "extraction":
      return `Keep what we read${sourceLabel ? ` about "${sourceLabel}"` : " from that message"}? (low confidence)`;
    case "off_template":
      return `"${(detail.docLabel as string) ?? "A document"}" had facts outside its template — add them anyway?`;
    case "category_proposal":
      return `Create the category "${(detail.label as string) ?? "?"}"${detail.count ? ` (${detail.count} things waiting)` : ""}?`;
    default:
      return `Review: ${kind.replace(/_/g, " ")}?`;
  }
}

export const MAX_PING_QUESTIONS = 5;

/**
 * The message sent back over the channel. Numbered NEWEST-FIRST — the same
 * ordering `applyReviewReply` resolves against, so "1" always means the most
 * recent decision. `extraProposals` = pending table changes riding the same
 * message (they resolve in the dashboard, not by reply).
 */
export function buildReviewPing(
  questions: PingQuestion[],
  opts: { reviewUrl?: string | null; extraProposals?: number } = {},
): string {
  const shown = questions.slice(0, MAX_PING_QUESTIONS);
  const lines: string[] = [];
  lines.push(
    shown.length === 1
      ? "datamodo — one thing needs your OK:"
      : `datamodo — ${shown.length} things need your OK:`,
  );
  shown.forEach((q, i) => lines.push(`${i + 1}. ${q.question}`));
  if (questions.length > shown.length) {
    lines.push(`…and ${questions.length - shown.length} more in the app.`);
  }
  if (opts.extraProposals) {
    lines.push(`(+${opts.extraProposals} table change${opts.extraProposals === 1 ? "" : "s"} to review in the app.)`);
  }
  lines.push(
    shown.length === 1
      ? `Reply "yes" or "no"${opts.reviewUrl ? ` — or review at ${opts.reviewUrl}` : ""}.`
      : `Reply "1 yes" / "2 no" (or "1y", "2n")${opts.reviewUrl ? ` — or review at ${opts.reviewUrl}` : ""}.`,
  );
  return lines.join("\n");
}

export interface ReviewReply {
  /** 1-based index into the newest-first pending list. */
  index: number;
  accept: boolean;
}

const YES = "(?:y|yes|ok|oui|approve|accept|confirm|👍|✓)";
const NO = "(?:n|no|non|reject|decline|deny|👎|✗|x)";

/**
 * Parse a channel reply into a decision. Understands "1 yes", "1y", "yes 1",
 * "approve 2", "2n", and bare "yes"/"no" when exactly one thing is pending.
 * Returns null for anything else — the message then flows into normal
 * capture, NEVER swallowed by mistake. `count` bounds the index.
 */
export function parseReviewReply(text: string, count: number): ReviewReply | null {
  if (count <= 0) return null;
  const t = text.trim().toLowerCase();
  if (!t || t.length > 24) return null; // real messages are longer — don't intercept

  let m = new RegExp(`^(\\d{1,2})\\s*${YES}$`, "u").exec(t);
  if (m) return bounded(Number(m[1]), true, count);
  m = new RegExp(`^(\\d{1,2})\\s*${NO}$`, "u").exec(t);
  if (m) return bounded(Number(m[1]), false, count);
  m = new RegExp(`^${YES}\\s*(\\d{1,2})$`, "u").exec(t);
  if (m) return bounded(Number(m[1]), true, count);
  m = new RegExp(`^${NO}\\s*(\\d{1,2})$`, "u").exec(t);
  if (m) return bounded(Number(m[1]), false, count);
  if (count === 1) {
    if (new RegExp(`^${YES}$`, "u").test(t)) return { index: 1, accept: true };
    if (new RegExp(`^${NO}$`, "u").test(t)) return { index: 1, accept: false };
  }
  return null;
}

function bounded(index: number, accept: boolean, count: number): ReviewReply | null {
  return index >= 1 && index <= count ? { index, accept } : null;
}
