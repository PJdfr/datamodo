// Harness: the Review Studio with a real-shaped queue (fetch stubbed) — a
// merge + a conflict row, the merge row auto-EXPANDED so the evidence card
// AND the per-row graph preview (ReviewGraphPanel → the real Explorer over
// the transformed future) are both in the screenshot. This is the surface
// the 2026-07-20 full-width fix protects: the panel must not crop.
// Run: npm run shoot -- review

import { createRoot } from "react-dom/client";
import { ReviewStudio } from "@/app/dashboard/review-studio";
import type { ReviewItem } from "@/lib/datamodo/review-types";
import type { KnowledgeEntityView, KnowledgeFactView } from "@/lib/datamodo/types";

const iso = (dAgo: number) => new Date(Date.now() - dAgo * 86400_000).toISOString();

const reviews: ReviewItem[] = [
  {
    kind: "entity_merge",
    id: "rv1",
    confidence: 0.62,
    impact: 5,
    createdAt: iso(1),
    parsed: { label: "Acme Incorporated", type: "company", attrs: [{ k: "email", v: "billing@acme.com" }] },
    canonical: { label: "Acme Inc", type: "company", attrs: [{ k: "email", v: "billing@acme.com" }, { k: "city", v: "Portland" }] },
    reason: "same billing email + names highly similar",
    sourceEntityId: "e-acme2",
    targetEntityId: "e-acme",
  },
  {
    kind: "fact_conflict",
    id: "rv2",
    confidence: 0.81,
    impact: 3,
    createdAt: iso(2),
    subjectEntityId: "e-inv",
    subject: "INV-4417",
    field: "amount",
    was: "$18,500.00",
    now: "$17,650.00",
    wasSource: "Invoice INV-4417 (email, Jul 12)",
    nowSource: "Corrected invoice (email, Jul 18)",
    note: "A newer message restates the amount lower.",
  },
];

// The graph preview walks REAL entity views — a small world around the merge.
const rel = (predicate: string, refId: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: iso(10),
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], edges = 1): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges, bodyMd: null, graphPin: null,
});
const entities: KnowledgeEntityView[] = [
  ent("e-acme", "company", "Acme Inc", [], 3),
  ent("e-acme2", "company", "Acme Incorporated", [rel("mentioned_in", "e-doc", "Q3 contract")], 2),
  ent("e-inv", "invoice", "INV-4417", [rel("issued_by", "e-acme", "Acme Inc")], 2),
  ent("e-bob", "person", "Bob Chen", [rel("works_for", "e-acme", "Acme Inc")], 1),
  ent("e-doc", "document", "Q3 contract", [], 1),
];

window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  if (url.includes("/api/knowledge/reviews")) return json({ reviews });
  if (url.includes("/api/knowledge/entities")) return json({ entities, datasets: [] });
  if (url.includes("/api/kinds")) return json({ kinds: [] });
  return json({});
}) as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<ReviewStudio />);

// Expand the merge row once painted so evidence + graph panel are visible.
const expand = (tries = 0) => {
  const row = [...document.querySelectorAll<HTMLElement>('[role="button"]')].find((el) => el.textContent?.includes("Acme Incorporated"));
  if (row) {
    row.click();
    flags.__mounted = true;
  } else if (tries < 40) {
    setTimeout(() => expand(tries + 1), 100);
  } else {
    flags.__mounted = true;
  }
};
expand();
