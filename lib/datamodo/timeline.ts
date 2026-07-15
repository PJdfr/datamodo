// TIMELINE — a chronological projection of the knowledge vault. Nothing here is
// a new store: every event is derived from data that already carries time —
// messages (received_at), domain dates (facts with value_date), supersessions
// (valid_to), and first sightings (entities.created_at). Filterable to one
// entity ("everything about Brightwave, in order") or global.
//
// This module is PURE (no imports) so it unit-tests under node:test; the DB
// fetch that feeds it lives with its only consumer, /api/knowledge/timeline.

// --- Pure input shapes (DB rows narrowed to what the projection needs) --------

export interface TimelineEntityInput {
  id: string;
  kind: string;
  label: string;
  createdAt: string; // ISO
}

export interface TimelineFactInput {
  id: string;
  subjectEntityId: string;
  objectEntityId: string | null;
  predicate: string;
  valueText: string | null;
  valueNum: number | null;
  valueDate: string | null; // YYYY-MM-DD
  unit: string | null;
  validFrom: string; // ISO
  validTo: string | null; // ISO — set when superseded
  supersededBy: string | null;
  sourceItemId: string | null;
}

export interface TimelineItemInput {
  id: string;
  channel: string;
  sender: string | null;
  subject: string | null;
  preview: string | null;
  receivedAt: string; // ISO
  /** When the sender actually sent it (email Date header etc.) — often earlier
   *  than receivedAt for forwarded mail. Null when the channel doesn't know. */
  sentAt?: string | null;
}

// --- Output ------------------------------------------------------------------

export interface TimelineEntityRef {
  id: string;
  kind: string;
  label: string;
}

export type TimelineEventType = "message" | "date" | "change" | "seen";

export interface TimelineEvent {
  /** The instant the event sits at on the axis (ISO). */
  ts: string;
  /** Day precision (domain dates) vs a real timestamp. */
  dateOnly: boolean;
  type: TimelineEventType;
  title: string;
  detail: string | null;
  /** Messages only: which channel it arrived on. */
  channel: string | null;
  itemId: string | null;
  predicate: string | null;
  /** The entities this event touches — the chips (and the per-entity filter). */
  entities: TimelineEntityRef[];
}

// --- Helpers -------------------------------------------------------------------

const pretty = (predicate: string) => predicate.replace(/_/g, " ");

/** Format a fact's value for a one-line event (entity refs → their label). */
export function formatFactValue(
  f: Pick<TimelineFactInput, "objectEntityId" | "valueText" | "valueNum" | "valueDate" | "unit">,
  labelOf: (id: string) => string,
): string {
  if (f.objectEntityId) return labelOf(f.objectEntityId);
  if (f.valueNum != null) return `${f.valueNum}${f.unit ? " " + f.unit : ""}`;
  if (f.valueDate) return f.valueDate;
  return f.valueText ?? "—";
}

function touches(f: TimelineFactInput, entityId: string): boolean {
  return f.subjectEntityId === entityId || f.objectEntityId === entityId;
}

// --- The projection ------------------------------------------------------------

export interface BuildTimelineOptions {
  /** Only events touching this entity ("everything about X, in order"). */
  entityId?: string | null;
  /** Cap the result (after sorting, newest first). Default 200. */
  limit?: number;
  /** Where message events sit on the axis: when they arrived here (default)
   *  or when the sender sent them (falls back to receivedAt when unknown) —
   *  forwarded email often carries a much older sent date. */
  timeBasis?: "received" | "sent";
}

/**
 * Derive the chronological event list. Pure — no I/O, deterministic. Events are
 * sorted newest-first; future domain dates (a due date next month) sort above
 * everything past, which is exactly where "upcoming" belongs.
 */
export function buildTimeline(
  entities: TimelineEntityInput[],
  facts: TimelineFactInput[],
  items: TimelineItemInput[],
  opts: BuildTimelineOptions = {},
): TimelineEvent[] {
  const limit = opts.limit ?? 200;
  const entityId = opts.entityId ?? null;
  const timeBasis = opts.timeBasis ?? "received";
  const byId = new Map(entities.map((e) => [e.id, e]));
  const labelOf = (id: string) => byId.get(id)?.label ?? "?";
  const refOf = (id: string): TimelineEntityRef | null => {
    const e = byId.get(id);
    return e ? { id: e.id, kind: e.kind, label: e.label } : null;
  };
  const refsOf = (ids: Iterable<string>): TimelineEntityRef[] => {
    const out: TimelineEntityRef[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const r = refOf(id);
      if (r) out.push(r);
    }
    return out;
  };

  const events: TimelineEvent[] = [];
  const factById = new Map(facts.map((f) => [f.id, f]));
  const factsByItem = new Map<string, TimelineFactInput[]>();
  for (const f of facts) {
    if (!f.sourceItemId) continue;
    if (!factsByItem.has(f.sourceItemId)) factsByItem.set(f.sourceItemId, []);
    factsByItem.get(f.sourceItemId)!.push(f);
  }

  // ① Messages — what arrived, and what we pulled out of it.
  for (const it of items) {
    const itemFacts = factsByItem.get(it.id) ?? [];
    if (entityId && !itemFacts.some((f) => touches(f, entityId))) continue;
    const entityIds = itemFacts.flatMap((f) =>
      f.objectEntityId ? [f.subjectEntityId, f.objectEntityId] : [f.subjectEntityId],
    );
    events.push({
      ts: timeBasis === "sent" ? (it.sentAt ?? it.receivedAt) : it.receivedAt,
      dateOnly: false,
      type: "message",
      title: it.subject || it.preview || "Message received",
      detail: [it.sender, itemFacts.length ? `${itemFacts.length} fact${itemFacts.length === 1 ? "" : "s"} extracted` : null]
        .filter(Boolean)
        .join(" · ") || null,
      channel: it.channel,
      itemId: it.id,
      predicate: null,
      entities: refsOf(entityIds).slice(0, 4),
    });
  }

  // ② Domain dates — a CURRENT fact whose value is a date is something that
  // happens/happened on that day (due dates, meeting dates, deadlines).
  for (const f of facts) {
    if (f.validTo !== null || !f.valueDate) continue;
    if (entityId && !touches(f, entityId)) continue;
    const subj = refOf(f.subjectEntityId);
    if (!subj) continue;
    events.push({
      ts: f.valueDate,
      dateOnly: true,
      type: "date",
      title: `${subj.label} — ${pretty(f.predicate)}`,
      detail: null,
      channel: null,
      itemId: f.sourceItemId,
      predicate: f.predicate,
      entities: refsOf(f.objectEntityId ? [f.subjectEntityId, f.objectEntityId] : [f.subjectEntityId]),
    });
  }

  // ③ Changes — a superseded fact marks the moment our knowledge was corrected.
  for (const f of facts) {
    if (f.validTo === null || !f.supersededBy) continue;
    if (entityId && !touches(f, entityId)) continue;
    const subj = refOf(f.subjectEntityId);
    if (!subj) continue;
    const next = factById.get(f.supersededBy);
    const was = formatFactValue(f, labelOf);
    const now = next ? formatFactValue(next, labelOf) : "?";
    events.push({
      ts: f.validTo,
      dateOnly: false,
      type: "change",
      title: `${subj.label} · ${pretty(f.predicate)} changed`,
      detail: `${was} → ${now}`,
      channel: null,
      itemId: next?.sourceItemId ?? f.sourceItemId,
      predicate: f.predicate,
      entities: refsOf([f.subjectEntityId]),
    });
  }

  // ④ First sightings — when an entity entered the vault.
  for (const e of entities) {
    if (entityId && e.id !== entityId) continue;
    events.push({
      ts: e.createdAt,
      dateOnly: false,
      type: "seen",
      title: `${e.label} first seen`,
      detail: null,
      channel: null,
      itemId: null,
      predicate: null,
      entities: refsOf([e.id]),
    });
  }

  // Newest first; day-precision events sort after timestamped ones on the same
  // instant so a message beats the due date it announced.
  events.sort((a, b) => {
    const ta = Date.parse(a.ts);
    const tb = Date.parse(b.ts);
    if (tb !== ta) return tb - ta;
    if (a.dateOnly !== b.dateOnly) return a.dateOnly ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
  return events.slice(0, limit);
}

// --- Commit log (Review → History, the git-style view) ------------------------
// The bitemporal vault makes history a QUERY, not new storage: each extraction
// run (source item) is a "commit", the facts it wrote are the diff — a fact
// that superseded an older one renders `~ was → now`, the rest `+ added`.
// Same pure inputs as the timeline; the Review tab's Commits view renders it.

export interface CommitDiffLine {
  op: "add" | "change";
  subject: TimelineEntityRef | null;
  predicate: string;
  value: string;
  /** `change` only: the value this fact replaced. */
  was?: string;
  /** The value names another entity (relationship, not attribute). */
  ref: boolean;
}

export interface TimelineCommit {
  /** The source item — the commit's identity (short-id it in the UI). */
  itemId: string;
  ts: string; // when it arrived (ISO)
  channel: string;
  sender: string | null;
  /** The commit message: the item's subject or preview. */
  title: string;
  added: number;
  changed: number;
  lines: CommitDiffLine[];
}

/**
 * Group extraction runs into commits, newest first. A message that wrote no
 * facts isn't a commit (nothing changed). `entityId` narrows to commits
 * touching one entity — per-entity blame grows from here.
 */
export function buildCommitLog(
  entities: TimelineEntityInput[],
  facts: TimelineFactInput[],
  items: TimelineItemInput[],
  opts: { limit?: number; entityId?: string | null } = {},
): TimelineCommit[] {
  const limit = opts.limit ?? 100;
  const entityId = opts.entityId ?? null;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const labelOf = (id: string) => byId.get(id)?.label ?? "?";
  const refOf = (id: string): TimelineEntityRef | null => {
    const e = byId.get(id);
    return e ? { id: e.id, kind: e.kind, label: e.label } : null;
  };

  // A new fact "changes" when some older fact points at it via supersededBy.
  const wasByNewFact = new Map<string, string>();
  for (const f of facts) {
    if (f.supersededBy) wasByNewFact.set(f.supersededBy, formatFactValue(f, labelOf));
  }

  const factsByItem = new Map<string, TimelineFactInput[]>();
  for (const f of facts) {
    if (!f.sourceItemId) continue;
    if (!factsByItem.has(f.sourceItemId)) factsByItem.set(f.sourceItemId, []);
    factsByItem.get(f.sourceItemId)!.push(f);
  }

  const commits: TimelineCommit[] = [];
  for (const it of items) {
    let itemFacts = factsByItem.get(it.id) ?? [];
    if (entityId) itemFacts = itemFacts.filter((f) => touches(f, entityId));
    if (itemFacts.length === 0) continue;
    const lines: CommitDiffLine[] = itemFacts
      .map((f) => {
        const was = wasByNewFact.get(f.id);
        return {
          op: (was !== undefined ? "change" : "add") as CommitDiffLine["op"],
          subject: refOf(f.subjectEntityId),
          predicate: f.predicate,
          value: formatFactValue(f, labelOf),
          ...(was !== undefined ? { was } : {}),
          ref: f.objectEntityId != null,
        };
      })
      // Changes first (the interesting part of a diff), then adds; stable
      // within each group by subject then predicate — deterministic.
      .sort((a, b) =>
        (a.op === b.op ? 0 : a.op === "change" ? -1 : 1) ||
        (a.subject?.label ?? "").localeCompare(b.subject?.label ?? "") ||
        a.predicate.localeCompare(b.predicate),
      );
    commits.push({
      itemId: it.id,
      ts: it.receivedAt,
      channel: it.channel,
      sender: it.sender,
      title: it.subject || it.preview || "Message",
      added: lines.filter((l) => l.op === "add").length,
      changed: lines.filter((l) => l.op === "change").length,
      lines,
    });
  }

  commits.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts) || a.itemId.localeCompare(b.itemId));
  return commits.slice(0, limit);
}
