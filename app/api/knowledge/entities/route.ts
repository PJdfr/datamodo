import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listKnowledge } from "@/lib/datamodo/knowledge";
import type { DatasetNodeSource } from "@/lib/datamodo/node-shapes";
import { prisma } from "@/lib/prisma";

// The user's knowledge layer (entities + facts), plus the dataset→row-entity
// map the Explorer uses to project datasets as walkable nodes (dataset-as-node
// is a VIRTUAL projection built client-side — see lib/datamodo/node-shapes.ts).
// Read-only, org-scoped.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ entities: [], datasets: [] });
  // AGENT LENS (P5): ?agent=<id> shows the vault as that agent sees it —
  // same entities, only the facts that agent's pipeline wrote.
  const agentId = new URL(req.url).searchParams.get("agent");
  const [entities, dsRows] = await Promise.all([
    listKnowledge(org.id, { agentId }),
    prisma.kinds.findMany({
      where: { org_id: org.id },
      select: {
        id: true,
        label: true,
        plural: true,
        columns: true,
        dataset_rows: {
          where: { status: "accepted", subject_entity_id: { not: null } },
          select: { subject_entity_id: true },
        },
      },
    }),
  ]);
  const datasets: DatasetNodeSource[] = dsRows.map((d) => ({
    id: d.id,
    name: d.plural?.trim() || `${d.label}s`,
    columns: Array.isArray(d.columns) ? d.columns.length : 0,
    rowEntityIds: d.dataset_rows.map((r: { subject_entity_id: string | null }) => r.subject_entity_id!).filter(Boolean),
  }));
  return NextResponse.json({ entities, datasets });
}
