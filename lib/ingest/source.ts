import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { readBlob } from "./store";
import { isRefetchable } from "./retention";
import type { IngestChannel } from "./types";

// Resolve an item's original content on demand — for the review surface (show the
// source chunk behind a proposal) and any "open the original" action. A hydrated
// item is read straight from its stored blobs; a dereferenced one is re-fetched
// from the provider using its source_ref (only channels where isRefetchable()).

export interface SourceAttachment {
  filename: string | null;
  contentType: string | null;
  bytes: number;
}

export interface ItemSource {
  itemId: string;
  channel: IngestChannel;
  state: "hydrated" | "dereferenced";
  sender: string | null;
  subject: string | null;
  sentAt: string | null;
  text: string | null;
  html: string | null;
  attachments: SourceAttachment[];
  /** Provider locators + deep link kept for re-fetch / "open original". */
  sourceRef: Record<string, unknown>;
}

export class SourceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceUnavailable";
  }
}

interface ItemRow {
  id: string;
  org_id: string;
  channel: IngestChannel;
  content_state: "hydrated" | "dereferenced";
  sender: string | null;
  subject: string | null;
  sent_at: string | null;
  body_hash: string | null;
  source_ref: Record<string, unknown>;
}

async function readHydrated(admin: SupabaseClient, item: ItemRow): Promise<ItemSource> {
  let text: string | null = null;
  let html: string | null = null;
  if (item.body_hash) {
    try {
      const buf = await readBlob(item.org_id, item.body_hash, admin);
      const parsed = JSON.parse(buf.toString("utf8")) as { text?: string | null; html?: string | null };
      text = parsed.text ?? null;
      html = parsed.html ?? null;
    } catch (e) {
      console.error("[source] body read failed", item.id, e);
    }
  }
  const { data, error } = await admin
    .from("attachments")
    .select("filename, content_type, bytes")
    .eq("item_id", item.id);
  if (error) throw error;
  const attachments: SourceAttachment[] = (data ?? []).map((a) => ({
    filename: a.filename,
    contentType: a.content_type,
    bytes: a.bytes,
  }));
  return {
    itemId: item.id,
    channel: item.channel,
    state: "hydrated",
    sender: item.sender,
    subject: item.subject,
    sentAt: item.sent_at,
    text,
    html,
    attachments,
    sourceRef: item.source_ref ?? {},
  };
}

/** Re-fetch a Slack message (and its files' metadata) from the source_ref. */
async function refetchSlack(item: ItemRow): Promise<ItemSource> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = item.source_ref?.channel as string | undefined;
  const ts = item.source_ref?.ts as string | undefined;
  if (!token || !channel || !ts) {
    throw new SourceUnavailable("This Slack message can no longer be retrieved.");
  }
  const res = await fetch("https://slack.com/api/conversations.history", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ channel, latest: ts, oldest: ts, inclusive: "true", limit: "1" }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    messages?: { text?: string; files?: { name?: string; mimetype?: string; size?: number }[] }[];
  };
  const msg = data.ok ? data.messages?.[0] : undefined;
  if (!msg) throw new SourceUnavailable("This Slack message was deleted or is no longer accessible.");
  return {
    itemId: item.id,
    channel: item.channel,
    state: "dereferenced",
    sender: item.sender,
    subject: item.subject,
    sentAt: item.sent_at,
    text: msg.text ?? null,
    html: null,
    attachments: (msg.files ?? []).map((f) => ({
      filename: f.name ?? null,
      contentType: f.mimetype ?? null,
      bytes: f.size ?? 0,
    })),
    sourceRef: item.source_ref ?? {},
  };
}

/** Get an item's source content, reading storage or re-fetching as needed. */
export async function getItemSource(
  itemId: string,
  admin: SupabaseClient = createAdminClient(),
): Promise<ItemSource> {
  const { data, error } = await admin
    .from("items")
    .select("id, org_id, channel, content_state, sender, subject, sent_at, body_hash, source_ref")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  const item = data as ItemRow | null;
  if (!item) throw new SourceUnavailable("Message not found.");

  if (item.content_state === "hydrated") return readHydrated(admin, item);
  if (item.channel === "slack") return refetchSlack(item);
  // Dereferenced on a non-re-fetchable channel should never happen (retention
  // only dereferences re-fetchable ones) — surface it rather than lie.
  if (!isRefetchable(item.channel)) {
    throw new SourceUnavailable("The original of this message was not retained and can't be re-fetched.");
  }
  throw new SourceUnavailable("This message can no longer be retrieved.");
}
