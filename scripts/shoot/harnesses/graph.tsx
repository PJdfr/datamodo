// Harness: the Data tab's whole-vault Graph (sigma.js + graphology) — the
// organic (ForceAtlas2) layout over a small connected world plus loose notes.
// Sigma needs WebGL; headless Chromium provides it via SwiftShader.
// Run: npm run shoot -- graph

import { createRoot } from "react-dom/client";
import { GraphView } from "@/app/dashboard/graph-view";
import { DEFAULT_KINDS } from "@/lib/datamodo/ontology";
import type { KnowledgeEntityView, KnowledgeFactView } from "@/lib/datamodo/types";

const rel = (predicate: string, refId: string): KnowledgeFactView => ({
  predicate, value: "?", ref: true, refId, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], edges = 1): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges, bodyMd: null, graphPin: null,
});

// Two companies sharing people/projects, invoice fans, and unlinked notes —
// enough structure for the force layout to show real clusters.
const world: KnowledgeEntityView[] = [
  {
    ...ent("acme", "company", "Acme Group", [], 14),
    naturalKeys: { domain: "acme.example" },
    bodyMd: "## About\nAcme commissions the **Q3 Rebrand** and pays through [[INV-900]].\n\n- Main contact: [[Elena Voss]]\n- Billing cycle: `net-30`\n\n> Forwarded contracts live in the files view.",
  },
  ent("bright", "company", "Brightwave", [], 8),
  ...Array.from({ length: 10 }, (_, i) => ent(`inv${i}`, "invoice", `INV-${900 + i}`, [rel("issued_by", i < 7 ? "acme" : "bright")], 1)),
  ent("elena", "person", "Elena Voss", [rel("works_for", "acme"), rel("partner_of", "bright")], 3),
  ent("marco", "person", "Marco Ruiz", [rel("works_for", "bright")], 2),
  ent("q3", "project", "Q3 Rebrand", [rel("commissioned_by", "acme"), rel("led_by", "elena")], 6),
  ...Array.from({ length: 5 }, (_, i) => ent(`qdoc${i}`, "document", `Q3 brief ${i}.pdf`, [rel("part_of", "q3")], 2)),
  ...Array.from({ length: 3 }, (_, i) => ent(`bdoc${i}`, "document", `BW-doc-${i}.pdf`, [rel("sent_by", "bright")], 1)),
  ...Array.from({ length: 4 }, (_, i) => ent(`note${i}`, "note", `Loose note ${i}`, [], 0)),
];

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <GraphView
    entities={world}
    kindByName={new Map(DEFAULT_KINDS.map((k) => [k.kind, k]))}
    onOpenPage={() => {}}
    onExplore={() => {}}
  />,
);
flags.__mounted = true;
