// Harness: the Map (semantic-zoom force graph) with a mocked world fetch.
// Run: npm run shoot -- force-graph

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

// Two hub worlds + a sub-hub + disconnected dust — enough structure that the
// initial fit shows clusters and zooming dissolves them.
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

// The view fetches its own world — answer from the fixture, no server needed.
(window as unknown as { fetch: typeof fetch }).fetch = (async (url: RequestInfo | URL) => ({
  ok: true,
  json: async () => (String(url).includes("/api/kinds") ? { kinds: DEFAULT_KINDS } : { entities: world, datasets: [] }),
})) as unknown as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<ForceGraphView />);
flags.__mounted = true;
