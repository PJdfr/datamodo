// Harness: the Timeline with fixture events (fetch stubbed).
// Run: npm run shoot -- timeline

import { createRoot } from "react-dom/client";
import { TimelineView } from "@/app/dashboard/timeline-view";
import type { TimelineEvent } from "@/lib/datamodo/timeline";

const EVENTS: TimelineEvent[] = [
  { ts: "2026-07-20", dateOnly: true, type: "date", title: "INV-9 — due date", detail: null, channel: null, itemId: null, predicate: "due_date", entities: [{ id: "inv", kind: "invoice", label: "INV-9" }] },
  { ts: "2026-07-10T14:22:00.000Z", dateOnly: false, type: "message", title: "Invoice attached — Acme July", detail: "billing@acme.com · 3 facts extracted", channel: "email", itemId: "m1", predicate: null, entities: [{ id: "acme", kind: "company", label: "Acme Inc" }, { id: "inv", kind: "invoice", label: "INV-9" }] },
  { ts: "2026-07-10T09:04:00.000Z", dateOnly: false, type: "change", title: "INV-9 · amount changed", detail: "1200 EUR → 1450 EUR", channel: null, itemId: "m2", predicate: "amount", entities: [{ id: "inv", kind: "invoice", label: "INV-9" }] },
  { ts: "2026-07-08T16:40:00.000Z", dateOnly: false, type: "message", title: "Kickoff Monday?", detail: "+31 6 1234 · 1 fact extracted", channel: "whatsapp", itemId: "m3", predicate: null, entities: [{ id: "bob", kind: "person", label: "Bob Vance" }] },
  { ts: "2026-07-08T10:00:00.000Z", dateOnly: false, type: "seen", title: "Bob Vance first seen", detail: null, channel: null, itemId: null, predicate: null, entities: [{ id: "bob", kind: "person", label: "Bob Vance" }] },
];

// The view fetches /api/knowledge/timeline — stub it with the fixtures.
window.fetch = (async () => ({
  ok: true,
  json: async () => ({ events: EVENTS }),
})) as unknown as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<TimelineView />);
flags.__mounted = true;
