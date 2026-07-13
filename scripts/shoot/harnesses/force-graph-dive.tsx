// Harness: the Map's walk handoff — a (synthetic) click on the Acme cluster
// card must drop into the REAL Explorer walk inline, centered on acme.
// Run: npm run shoot -- force-graph-dive

import { createRoot } from "react-dom/client";
import { ForceGraphView } from "@/app/dashboard/force-graph-view";
import { DEFAULT_KINDS } from "@/lib/datamodo/ontology";
import type { KnowledgeEntityView, KnowledgeFactView } from "@/lib/datamodo/types";

const rel = (predicate: string, refId: string): KnowledgeFactView => ({
  predicate, value: "?", ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = []): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges: facts.length, bodyMd: null, graphPin: null,
});

const world: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Group"),
  ...Array.from({ length: 12 }, (_, i) => ent(`ainv${i}`, "invoice", `INV-${900 + i}`, [rel("issued_by", "acme")])),
  ent("elena", "person", "Elena Voss", [rel("works_for", "acme")]),
  ent("marco", "person", "Marco Ruiz", [rel("works_for", "acme")]),
  ent("bright", "company", "Brightwave"),
  ...Array.from({ length: 7 }, (_, i) => ent(`bdoc${i}`, "document", `BW-doc-${i}.pdf`, [rel("sent_by", "bright")])),
  ent("priya", "person", "Priya Nair", [rel("works_for", "bright"), rel("knows", "elena")]),
];

(window as unknown as { fetch: typeof fetch }).fetch = (async (url: RequestInfo | URL) => ({
  ok: true,
  json: async () => (String(url).includes("/api/kinds") ? { kinds: DEFAULT_KINDS } : { entities: world, datasets: [] }),
})) as unknown as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<ForceGraphView />);

// Click (pointerdown+up, no movement) the Acme cluster card → the map must
// hand off to the real ExplorerView, standing on acme.
window.setTimeout(() => {
  const card = document.querySelector('[data-map-node="root/acme"]');
  if (!card) throw new Error("acme cluster card not found — clustering changed?");
  const r = card.getBoundingClientRect();
  const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, pointerId: 1 };
  card.dispatchEvent(new PointerEvent("pointerdown", at));
  card.dispatchEvent(new PointerEvent("pointerup", at));
  window.setTimeout(() => {
    if (!document.querySelector('[aria-label="Edge fact"], [role="button"][aria-label*="you are here"]')) {
      throw new Error("dive did not open the Explorer walk");
    }
  }, 500);
}, 600);
flags.__mounted = true;
