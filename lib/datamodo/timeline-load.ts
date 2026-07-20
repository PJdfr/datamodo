import { prisma } from "@/lib/prisma";
import {
  buildCommitLog,
  type TimelineCommit,
  type TimelineEntityInput,
  type TimelineFactInput,
  type TimelineItemInput,
} from "./timeline";

// DB shell for the pure timeline core (timeline.ts stays import-free so it
// unit-tests without a database). This module fetches the org's rows and
// adapts them to the projection input shapes; both the timeline API route and
// the MCP `list_commits` tool go through here, so the assembly lives once.

const iso = (d: Date | string | null): string | null => {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

export async function fetchTimelineInputs(orgId: string): Promise<{
  entityInputs: TimelineEntityInput[];
  factInputs: TimelineFactInput[];
  itemInputs: TimelineItemInput[];
}> {
  const [ents, facts, items] = await Promise.all([
    prisma.entities.findMany({
      where: { org_id: orgId, merged_into: null },
      select: { id: true, kind: true, canonical_label: true, created_at: true },
      take: 2000,
    }),
    prisma.facts.findMany({
      // All facts, superseded included — corrections are timeline events.
      where: { org_id: orgId },
      select: {
        id: true,
        subject_entity_id: true,
        object_entity_id: true,
        predicate: true,
        value_text: true,
        value_num: true,
        value_date: true,
        unit: true,
        valid_from: true,
        valid_to: true,
        superseded_by: true,
        source_item_id: true,
      },
      orderBy: { valid_from: "desc" },
      take: 5000,
    }),
    prisma.items.findMany({
      where: { org_id: orgId },
      select: { id: true, channel: true, sender: true, subject: true, body_preview: true, received_at: true, sent_at: true },
      orderBy: { received_at: "desc" },
      take: 500,
    }),
  ]);

  const entityInputs: TimelineEntityInput[] = ents.map((e) => ({
    id: e.id,
    kind: e.kind,
    label: e.canonical_label,
    createdAt: iso(e.created_at)!,
  }));
  const factInputs: TimelineFactInput[] = facts.map((f) => ({
    id: f.id,
    subjectEntityId: f.subject_entity_id,
    objectEntityId: f.object_entity_id,
    predicate: f.predicate,
    valueText: f.value_text,
    valueNum: f.value_num == null ? null : Number(f.value_num),
    valueDate: iso(f.value_date as unknown as Date | null)?.slice(0, 10) ?? null,
    unit: f.unit,
    validFrom: iso(f.valid_from)!,
    validTo: iso(f.valid_to),
    supersededBy: f.superseded_by,
    sourceItemId: f.source_item_id,
  }));
  const itemInputs: TimelineItemInput[] = items.map((it) => ({
    id: it.id,
    channel: String(it.channel),
    sender: it.sender,
    subject: it.subject,
    preview: it.body_preview,
    receivedAt: iso(it.received_at)!,
    sentAt: iso(it.sent_at),
  }));

  return { entityInputs, factInputs, itemInputs };
}

/** The commit log (Review → Commits) for an org — each extraction run a commit,
 *  the facts it wrote the diff. `entityId` narrows to one entity's history. */
export async function loadCommitLog(
  orgId: string,
  opts: { limit?: number; entityId?: string | null } = {},
): Promise<TimelineCommit[]> {
  const { entityInputs, factInputs, itemInputs } = await fetchTimelineInputs(orgId);
  return buildCommitLog(entityInputs, factInputs, itemInputs, opts);
}
