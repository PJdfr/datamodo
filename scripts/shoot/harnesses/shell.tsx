// Harness: the whole Control Center SHELL — refined sidebar (nav, needs-review,
// sources, compute, user), calmer topbar (⌘K pill + contextual Build), and the
// inset-sheet main pane, mounted with a populated agents view. Born in the
// 2026-07-22 premium-shell session. Run: npm run shoot -- shell
// A second pass opens the ⌘K palette and reshoots (run.mjs screenshots once —
// this harness toggles it open before flagging __mounted so the palette is IN
// the shot; comment the toggle out to shoot the plain shell).

import { createRoot } from "react-dom/client";
import ControlCenter from "@/app/dashboard/control-center";
import type { AgentRecord, DatasetView, ReviewItem, AgentActivityEntry, DatasetRelation } from "@/lib/datamodo/types";
import type { UserSettings, OnboardingContext } from "@/lib/datamodo/settings";

const iso = (dAgo: number) => new Date(Date.now() - dAgo * 86400_000).toISOString();

const agent = (id: string, name: string, status: "active" | "paused", channels: string[]): AgentRecord => ({
  id, org_id: "org", owner_user_id: "u", name, purpose_text: `Tracks ${name.toLowerCase()} across your channels.`,
  purpose: "curate", channels, mode: "auto", status, freestyle: false, avatar_bg: null,
  created_at: iso(30), updated_at: iso(1),
});
const agents: AgentRecord[] = [
  agent("a1", "Invoices", "active", ["gmail", "outlook"]),
  agent("a2", "Clients", "active", ["gmail", "slack"]),
  agent("a3", "Trips", "paused", ["whatsapp"]),
];

const ds = (id: string, agent_id: string | null, agentName: string | null, name: string, cols: string[], rowCount: number): DatasetView => ({
  id, org_id: "org", agent_id, kind_id: id, name, description: null,
  columns: cols.map((c) => ({ key: c.toLowerCase(), label: c, type: c === "Amount" ? "number" : "text" })),
  created_by: null, created_at: iso(30), updated_at: iso(0.2),
  agentName, rowCount, rows: [], history: [], proposals: [],
});
const datasets: DatasetView[] = [
  ds("d1", "a1", "Invoices", "Invoices", ["Vendor", "Amount", "Due"], 28),
  ds("d2", "a2", "Clients", "Clients", ["Name", "Company", "Email"], 12),
  ds("d3", "a3", "Trips", "Trips 2026", ["Trip", "Spend", "Nights"], 3),
  ds("d4", null, null, "Receipts", ["Merchant", "Amount", "Date"], 41),
];
const relations: DatasetRelation[] = [
  { id: "r1", fromDatasetId: "d1", fromDatasetName: "Invoices", fromColumn: "vendor", toDatasetId: "d2", toDatasetName: "Clients", toColumn: "company", label: "billed to" },
];

const pending: ReviewItem[] = [1, 2, 3].map((n) => ({
  id: `p${n}`, kind: "add", datasetId: "d1", datasetName: "Invoices",
  columns: datasets[0].columns, agent: "Invoices", batchId: "b1",
  sourceLabel: "Fwd: Invoice INV-44" + n, createdAt: iso(0.1), conflict: false,
  data: { vendor: "Acme Inc", amount: 1200 + n, due: "2026-08-01" }, cells: [],
}));

const activity: Record<string, AgentActivityEntry[]> = {
  Invoices: [{ id: "ac1", kind: "applied", datasetName: "Invoices", summary: "+2 rows from Fwd: Invoice INV-441", sourceLabel: "Fwd: Invoice INV-441", adds: 2, updates: 0, conflicts: 0, when: iso(0.3) }],
};

const settings: UserSettings = { plan: "pro", computeMode: "cloud", aiProvider: "anthropic", byokKeySet: false, byokMonthlyCapUsd: null, planStatus: "active", currentPeriodEnd: iso(-20) };
const onboarding: OnboardingContext = { businessContext: "Freelance product designer — invoices, clients, trips.", answers: {} };

window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  if (url.includes("/api/jobs/queue-status")) return json({ queued: 0, analyzing: 0, stuck: 0 });
  return json({});
}) as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <ControlCenter
    fullName="Pierre Dufour"
    initial="P"
    inbox="pierre-x91@in.datamodo.dev"
    agents={agents}
    datasets={datasets}
    relations={relations}
    pendingChanges={pending}
    pendingReviewCount={3}
    agentActivity={activity}
    settings={settings}
    onboarding={onboarding}
  />,
);
setTimeout(() => { flags.__mounted = true; }, 600);
