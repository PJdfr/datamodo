// REVIEW EXPLAIN — the plain-language layer of the review queue (user call
// 2026-07-20: "first the SOURCE of the uncertainty, then what's different if
// we accept or refuse — super simple"). One pure function turns any review
// item into three beats: WHY we're asking (the message / document / pattern
// that triggered it, with the quote when there is one), what ACCEPT does, and
// what REFUSE does — one short sentence each, no pipeline jargon. The dense
// evidence card and the graph preview stay available behind a disclosure; this
// module owns only the words. Pure (type imports only) — unit-tested.

import type { ReviewItem } from "./review-types";

export interface ReviewSource {
  /** Small glyph shown before the label (channel or origin). */
  icon: string;
  /** One line naming where this came from ("Email from billing@acme.com"). */
  label: string;
  /** The exact text that made us ask, when we have it (rendered as a quote). */
  quote: string | null;
}

export interface ReviewExplanation {
  /** The decision as one plain question. */
  question: string;
  /** WHY you're being asked — shown first. */
  source: ReviewSource;
  /** What happens if you accept — one or two short sentences. */
  accept: string;
  /** What happens if you refuse — one or two short sentences. */
  refuse: string;
  /** Button/card labels ("Same thing — merge" / "Different — keep both"). */
  acceptLabel: string;
  refuseLabel: string;
}

const CHANNEL_ICON: Record<string, string> = { email: "✉", whatsapp: "◌", slack: "▦", teams: "◇", upload: "⇪", app: "⊕" };
const channelIcon = (c: string) => CHANNEL_ICON[c] ?? "•";

const list = (labels: string[], max = 3): string => {
  const shown = labels.slice(0, max).join(", ");
  return labels.length > max ? `${shown}…` : shown;
};

/** One review → the three beats the simple decision card renders. */
export function explainReview(item: ReviewItem): ReviewExplanation {
  switch (item.kind) {
    case "entity_merge":
      return {
        question: `Are "${item.parsed.label}" and "${item.canonical.label}" the same ${item.canonical.type || "thing"}?`,
        source: {
          icon: "⇄",
          label: item.parsed.source
            ? `"${item.parsed.label}" just arrived via ${item.parsed.source} — it looks like "${item.canonical.label}", already in your data`
            : `"${item.parsed.label}" just arrived and looks like "${item.canonical.label}", already in your data`,
          quote: item.reason || null,
        },
        accept: `They become ONE ${item.canonical.type || "thing"} called "${item.canonical.label}". Everything known about either ends up on it — nothing is lost.`,
        refuse: `They stay two separate things, and we never ask about this pair again.`,
        acceptLabel: "Same — merge them",
        refuseLabel: "Different — keep both",
      };

    case "fact_conflict": {
      const field = item.field.replace(/_/g, " ");
      if (item.held) {
        return {
          question: `Switch ${item.subject}'s ${field} to "${item.now}"?`,
          source: {
            icon: "~",
            label: `${item.nowSource || "A newer message"} says "${item.now}" — but it looked less reliable than what you had, so nothing changed yet`,
            quote: null,
          },
          accept: `${item.subject}'s ${field} becomes "${item.now}". The old value "${item.was}" is kept in history.`,
          refuse: `Nothing changes — "${item.was}" stays, and the new claim is set aside.`,
          acceptLabel: "Switch to the new value",
          refuseLabel: "Keep what I had",
        };
      }
      return {
        question: `Is ${item.subject}'s ${field} now "${item.now}"?`,
        source: {
          icon: "~",
          label: `${item.nowSource || "A newer message"} says "${item.now}" — ${item.wasSource || "an earlier message"} said "${item.was}"`,
          quote: null,
        },
        accept: `"${item.now}" stays as the current value (it's already applied). "${item.was}" is kept in history.`,
        refuse: `Goes back to "${item.was}". The new claim is retired.`,
        acceptLabel: "Yes — keep the new value",
        refuseLabel: "No — restore the old one",
      };
    }

    case "extraction": {
      const n = item.facts.length;
      const who = list(item.entities.map((e) => e.label));
      return {
        question: `Did we read this message right?`,
        source: {
          icon: channelIcon(item.channel),
          label: `${item.channel === "email" ? "Email" : item.channel} from ${item.from || "an unknown sender"} — we weren't fully sure of our reading`,
          quote: item.snippet || null,
        },
        accept: `Keeps the ${n} fact${n === 1 ? "" : "s"} we read${who ? ` about ${who}` : ""} — they're already filed; you're confirming them.`,
        refuse: `Removes what this message added. Anything also known from other messages stays.`,
        acceptLabel: "Looks right — keep it",
        refuseLabel: "We misread — remove it",
      };
    }

    case "off_template": {
      const n = item.facts.length;
      return {
        question: `Keep the extra things "${item.docLabel}" mentioned?`,
        source: {
          icon: "▤",
          label: `Read in "${item.docLabel}" — ${n} detail${n === 1 ? "" : "s"} beyond what a ${item.docKind || "document"} of this kind usually carries. Nothing was filed yet`,
          quote: null,
        },
        accept: `Files the ${n} extra fact${n === 1 ? "" : "s"} into your knowledge, same as anything else.`,
        refuse: `Drops them. Everything else read from the document is unaffected.`,
        acceptLabel: "Keep them",
        refuseLabel: "Drop them",
      };
    }

    case "category_proposal":
      return {
        question: `Create a "${item.label}" category?`,
        source: {
          icon: "▣",
          label: `You keep capturing things that fit no category — ${item.count} so far (${list(item.sampleLabels)})`,
          quote: null,
        },
        accept: `Creates "${item.label}" with ${item.fields.length} ready-made field${item.fields.length === 1 ? "" : "s"} and its own table. The ${item.count} existing thing${item.count === 1 ? "" : "s"} snap into it.`,
        refuse: `No category is created, and we won't suggest this one again.`,
        acceptLabel: "Create it",
        refuseLabel: "No thanks",
      };

    case "field_proposal": {
      const pred = item.predicate.replace(/_/g, " ");
      if (item.aliasOf) {
        const canon = item.aliasOf.replace(/_/g, " ");
        return {
          question: `Is "${pred}" just another name for "${canon}"?`,
          source: {
            icon: "±",
            label: `${item.count} fact${item.count === 1 ? "" : "s"} on your ${item.targetKind}s say "${pred}" — your template already has "${canon}"`,
            quote: null,
          },
          accept: `From now on "${pred}" files into the "${canon}" column — no duplicate columns.`,
          refuse: `The template stays as is, and we won't suggest this again.`,
          acceptLabel: "Same field — link them",
          refuseLabel: "Leave it out",
        };
      }
      return {
        question: `Add "${pred}" to every ${item.targetKind}?`,
        source: {
          icon: "±",
          label: `${item.count} fact${item.count === 1 ? "" : "s"} already use "${pred}" on your ${item.targetKind}s — the template doesn't have it yet`,
          quote: null,
        },
        accept: `Every ${item.targetKind} gets a "${pred}" ${item.asRelation ? "connection" : "column"}; those ${item.count} fact${item.count === 1 ? "" : "s"} get a proper home in the table.`,
        refuse: `The template stays as is, and we won't suggest this again.`,
        acceptLabel: "Add it",
        refuseLabel: "Leave it out",
      };
    }

    case "orphan_prune":
      return {
        question: `Tidy away ${item.count} thing${item.count === 1 ? "" : "s"} linked to nothing?`,
        source: {
          icon: "−",
          label: `Found by the nightly cleanup — ${item.count} entit${item.count === 1 ? "y" : "ies"} nothing references (${list(item.entities.map((e) => e.label))})`,
          quote: null,
        },
        accept: `Deletes only the ones STILL unlinked right now — anything that gained a connection or was used recently survives.`,
        refuse: `Keeps them all, and we won't flag these again.`,
        acceptLabel: "Tidy them away",
        refuseLabel: "Keep them",
      };
  }
}
