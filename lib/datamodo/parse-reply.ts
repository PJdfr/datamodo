// PARSE-SUMMARY REPLY — when the user PINGS the agent directly (app chat,
// Slack DM, WhatsApp, an email sent straight to the agent), it answers back
// with what it actually parsed from the message: the entities filed, their
// facts, documents read, the note kept — or a plain "nothing to add". Passive
// captures (IMAP-watched mailboxes, capture_mode "auto") stay silent; nobody
// wants a bot narrating their whole inbox.
//
// PURE text building (unit-tested); delivery lives with the caller
// (extract.ts → item meta for the app thread, sendChannelText elsewhere).

import type { Extraction, ExtractedFact } from "./knowledge";

export interface ParseReplyDoc {
  filename: string | null;
  factsNew: number;
}

export interface ParseReplyInput {
  extraction: Extraction;
  /** The pipeline-authored note, when the message was a keep-worthy dump. */
  noteTitle?: string | null;
  /** Attachments that went through the document tier. */
  docs?: ParseReplyDoc[];
  /** Open questions this message left in Review (count). */
  pendingQuestions?: number;
}

const MAX_ENTITY_LINES = 8;
const MAX_FACTS_PER_ENTITY = 3;

function factValue(f: ExtractedFact, labelByLocalId: Map<string, string>): string {
  const v = f.value;
  if (v.kind === "number") return v.unit ? `${v.num} ${v.unit}` : String(v.num);
  if (v.kind === "date") return v.date;
  if (v.kind === "entity") return labelByLocalId.get(v.entityLocalId) ?? "…";
  return v.text.length > 40 ? `${v.text.slice(0, 37)}…` : v.text;
}

/** The reply text. Same content everywhere; plain lines + the brand's glyphs
 *  (no markdown headers — WhatsApp/Slack/email render it as-is). */
export function buildParseReply(input: ParseReplyInput): string {
  const { extraction } = input;
  const docs = input.docs ?? [];
  const labelByLocalId = new Map(extraction.entities.map((e) => [e.localId, e.label]));
  // Concept tags are the graph's topic glue — real, but not what the user
  // asked "what did you get from my message?" about. List them apart.
  const concrete = extraction.entities.filter((e) => e.kind !== "concept");
  const concepts = extraction.entities.filter((e) => e.kind === "concept");

  const lines: string[] = [];

  if (concrete.length === 0 && docs.length === 0 && !input.noteTitle) {
    lines.push("Nothing to file from this one — I read it, but found no structured data to add to your graph.");
  } else {
    lines.push("Here's what I filed from your message:");
    for (const e of concrete.slice(0, MAX_ENTITY_LINES)) {
      const facts = extraction.facts
        .filter((f) => f.subjectLocalId === e.localId)
        .slice(0, MAX_FACTS_PER_ENTITY)
        .map((f) => `${f.predicate.replace(/_/g, " ")}: ${factValue(f, labelByLocalId)}`);
      lines.push(`• ${e.label} (${e.kind})${facts.length ? ` — ${facts.join(" · ")}` : ""}`);
    }
    if (concrete.length > MAX_ENTITY_LINES) {
      lines.push(`• …and ${concrete.length - MAX_ENTITY_LINES} more`);
    }
    for (const d of docs) {
      lines.push(`▤ read ${d.filename ?? "attachment"}${d.factsNew > 0 ? ` — ${d.factsNew} fact${d.factsNew === 1 ? "" : "s"}` : ""}`);
    }
    if (input.noteTitle) lines.push(`✎ kept a note: "${input.noteTitle}"`);
    if (concepts.length) lines.push(`tagged: ${concepts.map((c) => c.label).join(", ")}`);
  }

  if (input.pendingQuestions) {
    lines.push(`${input.pendingQuestions} thing${input.pendingQuestions === 1 ? "" : "s"} I wasn't sure about — check the review bubble.`);
  }

  return lines.join("\n");
}

/** Should this item get a parse reply at all? Direct pings only:
 *  capture_mode "active" = the user sent it TO the agent (app chat, Slack DM,
 *  WhatsApp, direct email). "auto" = passive watching (IMAP) — stay silent. */
export function shouldSendParseReply(args: {
  captureMode: string | null;
  channel: string | null;
  viaApp: boolean;
}): "app" | "channel" | null {
  if (args.captureMode !== "active") return null;
  if (args.viaApp) return "app";
  if (args.channel === "slack" || args.channel === "whatsapp" || args.channel === "email") return "channel";
  return null; // teams (no outbound sender), MCP (Claude answers itself), etc.
}
