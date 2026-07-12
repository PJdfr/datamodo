// Harness: the Explorer (3D graph walk) with a small fixture world.
// Run: npm run shoot -- explorer

import { createRoot } from "react-dom/client";
import { ExplorerView } from "@/app/dashboard/explorer-view";
import { DEFAULT_KINDS } from "@/lib/datamodo/ontology";
import type { KnowledgeEntityView, KnowledgeFactView } from "@/lib/datamodo/types";

const rel = (predicate: string, refId: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: true, refId, sources: 2, provenance: [
    { channel: "email", sender: "billing@acme.com", subject: "Invoice", preview: "Invoice attached", snippet: "Total due: 1200 EUR", receivedAt: "2026-07-01T10:00:00.000Z" },
    { channel: "whatsapp", sender: "+3161234", subject: null, preview: "reminder", snippet: "Please pay INV-1", receivedAt: "2026-07-03T10:00:00.000Z" },
  ], confidence: 0.92, validFrom: "2026-07-01T00:00:00.000Z",
});
const ent = (id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], edges = 1): KnowledgeEntityView => ({
  id, kind, label, naturalKeys: {}, facts, edges, bodyMd: null, graphPin: null,
});

const world = [
  ent("acme", "company", "Acme Inc", [], 12),
  ent("inv1", "invoice", "INV-1", [rel("issued_by", "acme", "Acme Inc"), rel("references", "po", "PO-9")], 3),
  ent("inv2", "invoice", "INV-2", [rel("issued_by", "acme", "Acme Inc")], 2),
  // A long invoice tail — the ring groups these into "+N more invoices".
  ...Array.from({ length: 7 }, (_, i) =>
    ent(`invx${i}`, "invoice", `INV-${10 + i}`, [rel("issued_by", "acme", "Acme Inc")], 1),
  ),
  ent("bob", "person", "Bob Vance", [rel("works_for", "acme", "Acme Inc")], 2),
  ent("lance", "concept", "Lance format", [rel("related_to", "acme", "Acme Inc")], 2),
  ent("po", "document", "PO-9.pdf", [], 1),
];

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <ExplorerView
    entities={world}
    initialId="acme"
    kindByName={new Map(DEFAULT_KINDS.map((k) => [k.kind, k]))}
    onOpenPage={() => {}}
    // The answer→graph path: cited nodes halo + "used in the answer" chips.
    highlightIds={["acme", "inv1", "bob"]}
  />,
);
flags.__mounted = true;
