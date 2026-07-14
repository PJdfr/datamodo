// REVIEW INBOX (shell for review-ping.ts) — lists an org's pending reviews as
// numbered questions (NEWEST FIRST — the ordering replies resolve against)
// and applies a channel reply ("1 yes") to the right review with the real
// accept/reject side-effects. Used by the extraction hook (to compose the
// outbound ping) and by channel webhooks (to act on the reply).

import { prisma } from "@/lib/prisma";
import { acceptReview, rejectReview } from "./reviews";
import { reviewQuestion, parseReviewReply, MAX_PING_QUESTIONS, type PingQuestion } from "./review-ping";

/** The org's pending reviews as questions, newest first (capped). */
export async function pendingQuestions(orgId: string, itemId?: string): Promise<PingQuestion[]> {
  const rows = await prisma.knowledge_reviews.findMany({
    where: { org_id: orgId, status: "pending", ...(itemId ? { item_id: itemId } : {}) },
    orderBy: { created_at: "desc" },
    take: MAX_PING_QUESTIONS * 2,
    select: { id: true, kind: true, detail: true, source_entity_id: true, target_entity_id: true },
  });
  const entIds = [...new Set(rows.flatMap((r) => [r.source_entity_id, r.target_entity_id]).filter(Boolean) as string[])];
  const ents = entIds.length
    ? await prisma.entities.findMany({ where: { id: { in: entIds } }, select: { id: true, canonical_label: true } })
    : [];
  const label = new Map(ents.map((e) => [e.id, e.canonical_label]));
  return rows.map((r) => ({
    id: r.id,
    question: reviewQuestion(
      r.kind,
      (r.detail as Record<string, unknown>) ?? {},
      r.source_entity_id ? label.get(r.source_entity_id) : null,
      r.target_entity_id ? label.get(r.target_entity_id) : null,
    ),
  }));
}

/** Pending table changes tied to one message (they resolve in the app). */
export async function pendingProposalCount(orgId: string, itemId: string): Promise<number> {
  return prisma.dataset_rows.count({
    where: { org_id: orgId, status: "proposed", source_item_id: itemId },
  });
}

/**
 * Try to interpret a channel message as a review decision. Returns the
 * confirmation text to send back, or null when the message is NOT a reply
 * (→ the caller ingests it as a normal message). Numbering matches the ping:
 * newest pending review = 1.
 */
export async function applyReviewReply(orgId: string, text: string): Promise<string | null> {
  const questions = await pendingQuestions(orgId);
  const reply = parseReviewReply(text, Math.min(questions.length, MAX_PING_QUESTIONS));
  if (!reply) return null;
  const target = questions[reply.index - 1];
  if (!target) return null;
  try {
    if (reply.accept) await acceptReview(orgId, target.id);
    else await rejectReview(orgId, target.id);
  } catch {
    return "That decision could not be applied — it may already be resolved. Check the app's Review tab.";
  }
  return `${reply.accept ? "✓ Approved" : "✗ Declined"}: ${target.question.replace(/\?$/, "")}.`;
}
