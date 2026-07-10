// Timeline projection (pure core, no DB): everything we know about one entity,
// in chronological order — the bitemporal layer made visible. Facts carry
// valid_from/valid_to and supersession pointers, provenance carries the
// messages things arrived on; this module folds them into a single event
// stream: captured → asserted → changed → retracted. The DB fetch lives in
// knowledge.ts (`getEntityTimeline`); this file is unit-testable as-is.

export interface TimelineFactRow {
  id: string;
  predicate: string;
  /** Preformatted display value ("18500 USD", "Brightwave", "2026-08-31"). */
  value: string;
  /** True when this entity is the fact's OBJECT (an incoming edge). */
  incoming: boolean;
  /** The other end's label for relationship facts (object when outgoing,
   *  subject when incoming); null for attribute facts. */
  otherLabel: string | null;
  validFrom: string;
  validTo: string | null;
  supersededBy: string | null;
}

export interface TimelineSourceRow {
  factId: string;
  itemId: string | null;
  channel: string;
  sender: string | null;
  subject: string | null;
  receivedAt: string | null;
  snippet: string | null;
}

export type TimelineEventType = "captured" | "asserted" | "changed" | "retracted";

export interface TimelineEvent {
  at: string; // ISO
  type: TimelineEventType;
  /** Fact events: the predicate + display values. */
  predicate?: string;
  value?: string;
  /** "changed" only: the superseded value. */
  was?: string;
  incoming?: boolean;
  otherLabel?: string | null;
  /** "captured" only: the message that arrived. */
  channel?: string;
  sender?: string | null;
  subject?: string | null;
  snippet?: string | null;
}

/**
 * Fold an entity's fact history + provenance into one event stream, newest
 * first. Supersession renders as ONE "changed" event on the successor (was →
 * now), not an assert+retract pair; a fact closed with no successor is a
 * "retracted". Each source message appears once as "captured".
 */
export function composeEntityTimeline(
  facts: TimelineFactRow[],
  sources: TimelineSourceRow[],
): TimelineEvent[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  // Successor id → the fact it replaced (its "was" value).
  const replaced = new Map<string, TimelineFactRow>();
  for (const f of facts) {
    if (f.supersededBy && byId.has(f.supersededBy)) replaced.set(f.supersededBy, f);
  }

  const events: TimelineEvent[] = [];
  for (const f of facts) {
    const prior = replaced.get(f.id);
    events.push({
      at: f.validFrom,
      type: prior ? "changed" : "asserted",
      predicate: f.predicate,
      value: f.value,
      was: prior?.value,
      incoming: f.incoming,
      otherLabel: f.otherLabel,
    });
    // Closed with no successor = retracted (e.g. a rejected extraction);
    // a superseded fact's closing is already told by its successor's "changed".
    if (f.validTo && !f.supersededBy) {
      events.push({
        at: f.validTo,
        type: "retracted",
        predicate: f.predicate,
        value: f.value,
        incoming: f.incoming,
        otherLabel: f.otherLabel,
      });
    }
  }

  const seenItems = new Set<string>();
  for (const s of sources) {
    if (!s.itemId || seenItems.has(s.itemId) || !s.receivedAt) continue;
    seenItems.add(s.itemId);
    events.push({
      at: s.receivedAt,
      type: "captured",
      channel: s.channel,
      sender: s.sender,
      subject: s.subject,
      snippet: s.snippet,
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
