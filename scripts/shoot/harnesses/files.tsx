// Harness: the Files view (Finder column view over folder lenses).
// Run: npm run shoot -- files
// FilesView fetches /api/knowledge/entities + /api/kinds on mount, so we stub
// window.fetch with fixtures that discriminate several lenses (client, month,
// type) — enough to drill columns and add levels.

import { createRoot } from "react-dom/client";
import { FilesView } from "@/app/dashboard/files-view";
import type { KnowledgeEntityView, KnowledgeFactView } from "@/lib/datamodo/types";

const prov = (receivedAt: string, channel = "email") => [
  { channel, sender: "sam@acme.co", subject: null, preview: null, snippet: null, receivedAt },
];
const attr = (predicate: string, value: string, over: Partial<KnowledgeFactView> = {}): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 1, provenance: [], confidence: 1, validFrom: null, ...over,
});
const rel = (refId: string, value: string): KnowledgeFactView => ({
  predicate: "mentions", value, ref: true, refId, sources: 1, provenance: [], confidence: 1, validFrom: null,
});
const ent = (
  id: string, kind: string, label: string, facts: KnowledgeFactView[] = [], over: Partial<KnowledgeEntityView> = {},
): KnowledgeEntityView => ({ id, kind, label, naturalKeys: {}, facts, edges: facts.length, bodyMd: null, graphPin: null, ...over });

const ENTITIES: KnowledgeEntityView[] = [
  ent("acme", "company", "Acme Group"),
  ent("bw", "company", "Brightwave"),
  ent("d1", "document", "MSA.pdf", [
    attr("file_type", "application/pdf", { provenance: prov("2026-06-10T10:00:00Z") }),
    rel("acme", "Acme Group"), rel("bw", "Brightwave"),
  ], { naturalKeys: { id: "doc:h1:MSA.pdf" } }),
  ent("d2", "document", "Receipt June.jpg", [
    attr("file_type", "image/jpeg", { provenance: prov("2026-06-22T10:00:00Z", "whatsapp") }),
    rel("acme", "Acme Group"),
  ], { naturalKeys: { id: "doc:h2:Receipt June.jpg" } }),
  ent("d3", "document", "Invoice July.pdf", [
    attr("file_type", "application/pdf", { provenance: prov("2026-07-03T10:00:00Z") }),
    rel("acme", "Acme Group"),
  ], { naturalKeys: { id: "doc:h3:Invoice July.pdf" } }),
  ent("d4", "document", "Site photo.jpg", [
    attr("file_type", "image/jpeg", { provenance: prov("2026-07-19T10:00:00Z", "whatsapp") }),
    rel("bw", "Brightwave"),
  ], { naturalKeys: { id: "doc:h4:Site photo.jpg" } }),
  ent("n1", "note", "Pricing notes", [rel("acme", "Acme Group")], { bodyMd: "thoughts on pricing" }),
];

// Stub fetch for the two endpoints FilesView calls.
window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = url.includes("/api/kinds") ? { kinds: [] } : { entities: ENTITIES };
  return { ok: true, json: async () => body } as Response;
}) as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<FilesView />);
flags.__mounted = true;
