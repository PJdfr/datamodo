import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { projectEntitiesToDataset } from "@/lib/datamodo/project";

// Project the knowledge layer's entities of a kind into a dataset (as proposals
// the user reviews in the Versioning tab). Authorize with the session; run the
// privileged writes with the admin client, scoped to the user's org.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { kind?: string; datasetId?: string; labelColumn?: string };
  if (!body.kind || !body.datasetId) return NextResponse.json({ error: "kind and datasetId required" }, { status: 400 });

  const result = await projectEntitiesToDataset(org.id, { kind: body.kind, datasetId: body.datasetId, labelColumn: body.labelColumn });
  return NextResponse.json(result);
}
