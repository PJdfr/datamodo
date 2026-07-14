// Harness: the Review tab's git-style Commits view (fetch stubbed) — commit
// headers with short-id + channel + counts, diff lines (+ added, ~ was → now).
// Run: npm run shoot -- commits

import { createRoot } from "react-dom/client";
import { CommitLogView } from "@/app/dashboard/timeline-view";
import type { TimelineCommit } from "@/lib/datamodo/timeline";

const iso = (hAgo: number) => new Date(Date.now() - hAgo * 3600_000).toISOString();
const ref = (id: string, kind: string, label: string) => ({ id, kind, label });

const commits: TimelineCommit[] = [
  {
    itemId: "a1b2c3d4-0000", ts: iso(2), channel: "email", sender: "billing@acme.com",
    title: "Corrected invoice INV-4417 after the multi-year discount",
    added: 1, changed: 2,
    lines: [
      { op: "change", subject: ref("i1", "invoice", "INV-4417"), predicate: "amount", value: "$17,650.00", was: "$18,500.00", ref: false },
      { op: "change", subject: ref("b1", "company", "Brightwave"), predicate: "account_manager", value: "Elena Ruiz", was: "James Porter", ref: false },
      { op: "add", subject: ref("i1", "invoice", "INV-4417"), predicate: "payment_terms", value: "net 45", ref: false },
    ],
  },
  {
    itemId: "e5f6a7b8-0000", ts: iso(26), channel: "whatsapp", sender: "+1 (415) 555-0142",
    title: "Dinner with the Northwind team Thurs 7pm — SOW next week",
    added: 8, changed: 0,
    lines: [
      { op: "add", subject: ref("n1", "company", "Northwind"), predicate: "meeting", value: "Thu 7:00pm", ref: false },
      { op: "add", subject: ref("n1", "company", "Northwind"), predicate: "expected", value: "SOW next week", ref: false },
      { op: "add", subject: ref("p1", "person", "Dana Cole"), predicate: "works_for", value: "Northwind", ref: true },
      { op: "add", subject: ref("p1", "person", "Dana Cole"), predicate: "role", value: "procurement lead", ref: false },
      { op: "add", subject: ref("n1", "company", "Northwind"), predicate: "stage", value: "negotiation", ref: false },
      { op: "add", subject: ref("n1", "company", "Northwind"), predicate: "city", value: "Portland", ref: false },
      { op: "add", subject: ref("p1", "person", "Dana Cole"), predicate: "email", value: "dana@northwind.io", ref: false },
      { op: "add", subject: ref("n1", "company", "Northwind"), predicate: "source", value: "referral", ref: false },
    ],
  },
];

window.fetch = (async () =>
  new Response(JSON.stringify({ commits }), { headers: { "content-type": "application/json" } })) as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<CommitLogView />);
flags.__mounted = true;
