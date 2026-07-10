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
      ts: it.receivedAt,
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
