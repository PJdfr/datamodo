import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { planVault, noteToExtraction, type VaultFile } from "@/lib/datamodo/obsidian-import";
import { ingestExtraction, normalizeKey } from "@/lib/datamodo/knowledge";

// OBSIDIAN VAULT IMPORT (phase 1). The browser (or CLI) parses nothing —
// it sends batches of raw .md files; this route runs the pure mapping and
// ingests DETERMINISTICALLY (adjudicate:false — zero LLM calls, zero
// embeddings; the consolidation tick embeds and proposes merges later).
//
// Modes: default = DRY RUN (parse + plan, nothing writes); confirm:true =
// ingest. Idempotent by content hash: one items row per note
// (external_id "obsidian:<path>"), unchanged notes no-op, edited notes
// re-ingest (claim-key dedup + supersession give them history for free).
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES_PER_REQUEST = 120;
const MAX_FILE_CHARS = 300_000;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(user.id);
  if (!org) return NextResponse.json({ error: "no org" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { files?: VaultFile[]; confirm?: boolean } | null;
  const files = (body?.files ?? [])
    .filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
    .slice(0, MAX_FILES_PER_REQUEST)
    .map((f) => ({ path: f.path.replace(/^\/+/, ""), content: f.content.slice(0, MAX_FILE_CHARS) }));
  if (files.length === 0) return NextResponse.json({ error: "no files" }, { status: 400 });

  const plan = planVault(files);
  if (!body?.confirm) {
    return NextResponse.json({
      dryRun: true,
      stats: plan.stats,
      folderShapes: plan.folderShapes,
      sample: plan.notes.slice(0, 8).map((n) => ({ name: n.name, links: n.links.length, tags: n.tags.length })),
    });
  }

  let created = 0, updated = 0, unchanged = 0, factsNew = 0, entitiesCreated = 0;
  for (const note of plan.notes) {
    const hash = createHash("sha256").update(note.body).digest("hex");
    const externalId = `obsidian:${note.path}`;
    const existing = await prisma.items.findFirst({
      where: { org_id: org.id, channel: "upload", external_id: externalId },
      select: { id: true, body_hash: true },
    });
    if (existing?.body_hash === hash) { unchanged++; continue; }

    const data = {
      body_hash: hash,
      body_preview: note.body.slice(0, 280),
      bytes: BigInt(note.body.length),
      subject: note.title,
      status: "analyzed" as const,
      meta: { via: "obsidian", path: note.path },
    };
    const item = existing
      ? await prisma.items.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.items.create({
          data: { ...data, org_id: org.id, owner_user_id: user.id, channel: "upload", external_id: externalId },
          select: { id: true },
        });
    if (existing) updated++; else created++;

    const res = await ingestExtraction(org.id, user.id, item.id, noteToExtraction(note), undefined, { adjudicate: false });
    factsNew += res.factsNew;
    entitiesCreated += res.entitiesCreated;

    // The note's PAGE: body_md = the note itself (wikilinks render live).
    const ent = await prisma.entities.findFirst({
      where: { org_id: org.id, kind: "note", normalized_key: normalizeKey({ kind: "note", label: note.name }), merged_into: null },
      select: { id: true },
    });
    if (ent) {
      await prisma.entities.update({
        where: { id: ent.id, org_id: org.id },
        data: { body_md: note.body, updated_at: new Date() },
      });
    }
  }

  // Folder shapes → category proposals (deterministic — no AI draft): a
  // folder whose notes share frontmatter keys IS a template announcing
  // itself. Fields typed from the notes' actual values (wikilink values
  // become relations); the user accepts in Review like any proposal.
  // Any-status dedupe: a folder's kind is only ever proposed once.
  let proposals = 0;
  for (const shape of plan.folderShapes) {
    try {
      const kind = shape.folder.split("/").pop()!.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/s$/, "");
      if (!kind) continue;
      const prior = await prisma.knowledge_reviews.findFirst({
        where: { org_id: org.id, kind: "category_proposal", detail: { path: ["proposedKind"], equals: kind } },
        select: { id: true },
      });
      if (prior) continue;
      const group = plan.notes.filter((n) => n.path.startsWith(`${shape.folder}/`));
      const fields: { key: string; label: string; type: string }[] = [];
      const relations: { predicate: string; label: string; targetKind?: string }[] = [];
      for (const key of shape.sharedKeys) {
        const sample = group.map((n) => n.props[key]).find((v) => v != null && v !== "");
        const k = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const label = key.replace(/[_-]/g, " ");
        if (typeof sample === "string" && /^\[\[/.test(sample)) relations.push({ predicate: k, label });
        else if (typeof sample === "number") fields.push({ key: k, label, type: "number" });
        else if (typeof sample === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sample)) fields.push({ key: k, label, type: "date" });
        else fields.push({ key: k, label, type: "text" });
      }
      await prisma.knowledge_reviews.create({
        data: {
          org_id: org.id,
          owner_user_id: user.id,
          kind: "category_proposal",
          status: "pending",
          impact: shape.notes,
          detail: {
            proposedKind: kind,
            label: kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
            count: shape.notes,
            sampleLabels: group.slice(0, 5).map((n) => n.name),
            template: { description: `Imported from your Obsidian "${shape.folder}" folder.`, aliases: [], fields, relations },
          },
        },
      });
      proposals++;
    } catch (e) {
      console.error(`[obsidian] category proposal failed for ${shape.folder}`, e);
    }
  }

  return NextResponse.json({
    dryRun: false,
    stats: plan.stats,
    folderShapes: plan.folderShapes,
    result: { created, updated, unchanged, entitiesCreated, factsNew, proposals },
  });
}
