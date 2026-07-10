import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import {
  buildTimeline,
  type BuildTimelineOptions,
  type TimelineEntityInput,
  type TimelineEvent,
  type TimelineFactInput,
  type TimelineItemInput,
} from "@/lib/datamodo/timeline";

// The chronological projection of the knowledge vault. Read-only, org-scoped.
// ?entity=<id> narrows to one entity's history; global otherwise. The event
// derivation itself is pure (lib/datamodo/timeline.ts) — this route only
// fetches the rows and adapts them to the projection's input shapes.
export const runtime = "nodejs";

const iso = (d: Date | string | null): string | null => {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

async function listTimeline(orgId: string, opts: BuildTimelineOptions): Promise<TimelineEvent[]> {
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
      select: { id: true, channel: true, sender: true, subject: true, body_preview: true, received_at: true },
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
  }));

  return buildTimeline(entityInputs, factInputs, itemInputs, opts);
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ events: [] });
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entity");
  const events = await listTimeline(org.id, { entityId: entityId || null });
  return NextResponse.json({ events });
}
