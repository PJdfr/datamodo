// Harness: the entity page's "◷ History" disclosure in BLAME mode — the
// commit log filtered to one entity (which run added/changed each of its
// facts). fetch is stubbed with a commits payload; the harness opens the
// disclosure and switches to the blame tab after mount.
// Run: npm run shoot -- entity-blame

import { createRoot } from "react-dom/client";
import { EntityHistory } from "@/app/dashboard/timeline-view";
import type { TimelineCommit } from "@/lib/datamodo/timeline";

const iso = (hAgo: number) => new Date(Date.now() - hAgo * 3600_000).toISOString();
const ref = (id: string, kind: string, label: string) => ({ id, kind, label });

// Commits touching INV-4417 only (buildCommitLog(entityId) narrows the lines).
const commits: TimelineCommit[] = [
  {
    itemId: "c1a2b3c4-0000", ts: iso(2), channel: "email", sender: "billing@acme.com",
    title: "Corrected invoice after the multi-year discount",
    added: 1, changed: 1,
    lines: [
      { op: "change", subject: ref("inv", "invoice", "INV-4417"), predicate: "amount", value: "$17,650.00", was: "$18,500.00", ref: false },
      { op: "add", subject: ref("inv", "invoice", "INV-4417"), predicate: "payment_terms", value: "net 45", ref: false },
    ],
  },
  {
    itemId: "d5e6f7a8-0000", ts: iso(72), channel: "email", sender: "billing@acme.com",
    title: "Original invoice INV-4417.pdf",
    added: 3, changed: 0,
    lines: [
      { op: "add", subject: ref("inv", "invoice", "INV-4417"), predicate: "amount", value: "$18,500.00", ref: false },
      { op: "add", subject: ref("inv", "invoice", "INV-4417"), predicate: "issued_by", value: "Acme Group", ref: true },
      { op: "add", subject: ref("inv", "invoice", "INV-4417"), predicate: "due", value: "2026-08-01", ref: false },
    ],
  },
];

window.fetch = (async (url: string | URL | Request) => {
  const u = String(url);
  const body = u.includes("view=commits") ? { commits } : { events: [] };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}) as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <div style={{ maxWidth: 640, margin: "0 auto" }}>
    <EntityHistory entityId="inv" />
  </div>,
);

// Open the disclosure, then switch to the blame tab.
window.setTimeout(() => {
  const openBtn = document.querySelector('button[aria-expanded="false"]') as HTMLButtonElement | null;
  openBtn?.click();
  window.setTimeout(() => {
    const tabs = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("blame")) as HTMLButtonElement | undefined;
    tabs?.click();
    flags.__mounted = true;
  }, 150);
}, 200);
