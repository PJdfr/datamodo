// Harness: the Notion-grammar TABLE PAGE (redesign 2026-07-20) — virtualized
// typed grid + provenance dots + the side peek showing the first row's entity
// page (server actions stubbed by run.mjs, fetch stubbed here).
// Run: npm run shoot -- table-grid

import { createRoot } from "react-dom/client";
import { TablePage } from "@/app/dashboard/table-page";
import type { DatasetRowRecord, DatasetView, KnowledgeEntityView } from "@/lib/datamodo/types";

const iso = (dAgo: number) => new Date(Date.now() - dAgo * 86400_000).toISOString();

const columns = [
  { key: "number", label: "Number", type: "text" },
  { key: "client", label: "Client", type: "text" },
  { key: "total", label: "Total", type: "number" },
  { key: "due_date", label: "Due date", type: "date" },
  { key: "status", label: "Status", type: "status" },
];

const CLIENTS = ["Acme Inc", "Brightwave", "Northwind", "Ferro & Sons", "Lumen Labs"];
const STATUS = ["unpaid", "paid", "overdue", "draft"];
const rows: DatasetRowRecord[] = Array.from({ length: 60 }, (_, i) => ({
  id: `r${i + 1}`,
  data: {
    number: `INV-${900 + i}`,
    client: CLIENTS[i % CLIENTS.length],
    total: Math.round((400 + i * 137.5) * 100) / 100,
    due_date: `2026-0${(i % 8) + 1}-1${i % 9}`,
    status: STATUS[i % STATUS.length],
  },
  humanEdited: i % 7 === 0,
  subjectEntityId: i === 0 ? "e1" : i % 3 === 0 ? `e${i}` : null,
  createdBy: i % 11 === 0 ? "user-1" : null,
}));

const entity: KnowledgeEntityView = {
  id: "e1",
  kind: "invoice",
  label: "INV-900",
  naturalKeys: { number: "INV-900" },
  edges: 3,
  bodyMd: null,
  graphPin: null,
  facts: [
    { predicate: "total", value: "400", ref: false, refId: null, sources: 2, confidence: 0.92, validFrom: iso(12), provenance: [{ channel: "email", sender: "billing@acme.com", subject: "Invoice INV-900", preview: "Please find attached…", snippet: "Total due: $400.00", receivedAt: iso(12) }] },
    { predicate: "status", value: "unpaid", ref: false, refId: null, sources: 1, confidence: 0.84, validFrom: iso(12), provenance: [] },
    { predicate: "due_date", value: "2026-01-10", ref: false, refId: null, sources: 1, confidence: 0.9, validFrom: iso(12), provenance: [] },
    { predicate: "issued_by", value: "Acme Inc", ref: true, refId: "e-acme", sources: 2, confidence: 0.95, validFrom: iso(12), provenance: [] },
  ],
};

const table: DatasetView = {
  id: "t1",
  org_id: "org",
  agent_id: null,
  kind_id: "t1",
  name: "Invoices",
  description: null,
  columns,
  created_by: null,
  created_at: iso(40),
  updated_at: iso(1),
  agentName: "Bookkeeper",
  rowCount: rows.length,
  rows: [],
  history: [],
  proposals: [],
};

declare global {
  interface Window { __shootRows?: DatasetRowRecord[]; __mounted?: boolean }
}
window.__shootRows = rows;

const KINDS = {
  kinds: [{
    id: "t1", kind: "invoice", label: "Invoice", plural: "Invoices", color: "#B08A2E",
    aliases: [], builtin: true, relations: [],
    fields: [
      { key: "number", label: "Number", type: "text", required: true },
      { key: "total", label: "Total", type: "number", required: true },
      { key: "due_date", label: "Due date", type: "date", required: false },
      { key: "status", label: "Status", type: "text", required: false },
    ],
  }],
};

window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  if (url.includes("/api/kinds")) return json(KINDS);
  if (url.includes("/api/knowledge/entities/")) return json({ entity });
  return json({});
}) as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <TablePage table={table} onClose={() => {}} onChanged={() => {}} onExplore={() => {}} onReview={() => {}} />,
);

// Open the side peek on the first row (its title cell) once the grid painted,
// so the screenshot shows grid + peek together.
const openPeek = (tries = 0) => {
  const cell = document.querySelector<HTMLElement>('[role="row"] [role="gridcell"]');
  if (cell) {
    cell.click();
    flags.__mounted = true;
  } else if (tries < 40) {
    setTimeout(() => openPeek(tries + 1), 100);
  } else {
    flags.__mounted = true; // screenshot whatever rendered; page errors fail the run
  }
};
openPeek();
