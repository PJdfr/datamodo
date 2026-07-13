// Harness: the Map mid-zoom — wheel events fire after mount, so the shot
// catches clusters DISSOLVED into sub-clusters/cards (the semantic-zoom rule).
// Run: npm run shoot -- force-graph-zoom

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
  ent("q3", "project", "Q3 Rebrand", [rel("commissioned_by", "acme")]),
  ...Array.from({ length: 5 }, (_, i) => ent(`qdoc${i}`, "document", `Q3 brief ${i}.pdf`, [rel("part_of", "q3")])),
  ent("bright", "company", "Brightwave"),
  ...Array.from({ length: 7 }, (_, i) => ent(`bdoc${i}`, "document", `BW-doc-${i}.pdf`, [rel("sent_by", "bright")])),
  ent("priya", "person", "Priya Nair", [rel("works_for", "bright"), rel("knows", "elena")]),
  ...Array.from({ length: 4 }, (_, i) => ent(`note${i}`, "note", `Loose note ${i}`)),
];

(window as unknown as { fetch: typeof fetch }).fetch = (async (url: RequestInfo | URL) => ({
  ok: true,
  json: async () => (String(url).includes("/api/kinds") ? { kinds: DEFAULT_KINDS } : { entities: world, datasets: [] }),
})) as unknown as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<ForceGraphView />);

// After fetch + fit settle, zoom ~3× toward the canvas center: the big
// clusters must cross splitPx and dissolve before the screenshot lands.
window.setTimeout(() => {
  const wrap = document.querySelector("svg")?.parentElement;
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  for (let i = 0; i < 3; i++) {
    window.setTimeout(() => {
      wrap.dispatchEvent(new WheelEvent("wheel", {
        deltaY: -250, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        bubbles: true, cancelable: true,
      }));
    }, i * 90);
  }
}, 450);
flags.__mounted = true;
