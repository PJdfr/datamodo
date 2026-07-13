// Harness: the Explorer's zoom-out — wheel events fire after mount, so the
// shot catches the LAYERED view (fixed-bearing rings, deeper hops, the
// unlinked outer ring) instead of the walk.
// Run: npm run shoot -- explorer-layers

import { createRoot } from "react-dom/client";
import { ExplorerView } from "@/app/dashboard/explorer-view";
import { DEFAULT_KINDS } from "@/lib/datamodo/ontology";
import type { KnowledgeEntityView, KnowledgeFactView } from "@/lib/datamodo/types";

const rel = (predicate: string, refId: string): KnowledgeFactView => ({
  predicate, value: "?", ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], edges = 1): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges, bodyMd: null, graphPin: null,
});

// Depth: acme → invoices/people (1 hop) → project docs (2) → doc authors (3),
// plus a second company two hops out and unlinked notes for the final ring.
const world: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Group", [], 12),
  ...Array.from({ length: 9 }, (_, i) => ent(`inv${i}`, "invoice", `INV-${900 + i}`, [rel("issued_by", "acme")], 1)),
  ent("elena", "person", "Elena Voss", [rel("works_for", "acme")], 3),
  ent("q3", "project", "Q3 Rebrand", [rel("commissioned_by", "acme")], 6),
  ...Array.from({ length: 4 }, (_, i) => ent(`qdoc${i}`, "document", `Q3 brief ${i}.pdf`, [rel("part_of", "q3")], 2)),
  ent("marco", "person", "Marco Ruiz", [rel("wrote", "qdoc0")], 1),
  ent("bright", "company", "Brightwave", [rel("partner_of", "elena")], 4),
  ...Array.from({ length: 3 }, (_, i) => ent(`bdoc${i}`, "document", `BW-doc-${i}.pdf`, [rel("sent_by", "bright")], 1)),
  ...Array.from({ length: 3 }, (_, i) => ent(`note${i}`, "note", `Loose note ${i}`, [], 0)),
];

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <ExplorerView
    entities={world}
    initialId="acme"
    kindByName={new Map(DEFAULT_KINDS.map((k) => [k.kind, k]))}
    onOpenPage={() => {}}
  />,
);

// Scroll out over the walk (events bubble from the center card to the canvas
// listener) → the layered view, out to ~4 layers.
window.setTimeout(() => {
  const target = document.querySelector('[aria-label*="you are here"]');
  if (!target) throw new Error("walk center card not found");
  for (let i = 0; i < 6; i++) {
    window.setTimeout(() => {
      target.dispatchEvent(new WheelEvent("wheel", { deltaY: 160, bubbles: true, cancelable: true }));
    }, i * 60);
  }
}, 500);
flags.__mounted = true;
