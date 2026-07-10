"use client";

/**
 * Datamodo Control Center — the signed-in workspace.
 *
 * Ported from the "Datamodo Control Center.dc.html" design handoff. Agents,
 * data tables, the agent activity feed, the table relationship graph, and the
 * unified Versioning ("pull request") review are all REAL — loaded from Supabase
 * by the server component and mutated via Server Actions. Only NL Search remains
 * illustrative (see app/dashboard/README.md for the roadmap).
 */

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { signout } from "@/app/auth/actions";
import {
  createAgentAction,
  updateAgentAction,
  deleteAgentAction,
  createDatasetAction,
  renameDatasetAction,
  deleteDatasetAction,
  addColumnAction,
  removeColumnAction,
  addRowAction,
  updateRowAction,
  deleteRowAction,
  restoreSnapshotAction,
  getSnapshotsAction,
  getDatasetRowsAction,
  simulateAgentUpdateAction,
  acceptProposalAction,
  rejectProposalAction,
  acceptBatchAction,
  rejectBatchAction,
  createRelationAction,
  deleteRelationAction,
  updateComputeSettingsAction,
} from "./actions";
import type { AgentActivityEntry, AgentRecord, ChangeChunk, DatasetColumn, DatasetRelation, DatasetRowRecord, DatasetView, Proposal, ReviewItem, SnapshotFull } from "@/lib/datamodo/types";
import type { UserSettings, OnboardingContext } from "@/lib/datamodo/settings";
import type { SearchResult, SearchHit, KnowledgeHit } from "@/lib/datamodo/search";
import type { RelationSuggestion } from "@/lib/datamodo/relations";
import { PLANS, PLAN_ORDER, planLimits, type ComputeMode } from "@/lib/datamodo/plans";
import {
  Hov, C, LOGO, CH_NAMES, navStyle, modeCard, radioDot, bar, toggleTrack, toggleKnob,
  channelTile, targetChip, monoLabel, fieldInput, fieldLabel, primaryBtn, ghostBtn,
  pickColor, relTime, showVal, coerceByType, slugify, COLUMN_TYPES, Segmented, ModalShell,
  Panel, DiffBadge, useAction, type Agent, type TableInfo,
} from "./ui";
import { ReviewStudio } from "./review-studio";
import { ConnectionsModal } from "./connections";
import { OnboardingModal } from "./onboarding-modal";
import { ImportGraphModal } from "./import-graph-modal";
import { KnowledgeView } from "./knowledge-view";
import { InsightsView } from "./insights-view";
import { FilesView } from "./files-view";
import { BuildFromKnowledgeModal } from "./build-from-knowledge";

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */
type Tab = "agents" | "data" | "review" | "search";
type DataView = "tables" | "knowledge" | "insights" | "files";
export type ControlCenterProps = {
  fullName: string;
  initial: string;
  inbox: string;
  agents: AgentRecord[];
  datasets: DatasetView[];
  relations: DatasetRelation[];
  pendingChanges: ReviewItem[];
  pendingReviewCount: number;
  agentActivity: Record<string, AgentActivityEntry[]>;
  settings: UserSettings;
  onboarding: OnboardingContext;
  notice?: string | null;
};

export default function ControlCenter({ fullName, initial, inbox, agents, datasets, relations, pendingChanges, pendingReviewCount, agentActivity, settings, onboarding, notice }: ControlCenterProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("agents");
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Pending changes proposed per agent (for the agent-card badges).
  const pendingByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pendingChanges) m.set(p.agent, (m.get(p.agent) ?? 0) + 1);
    return m;
  }, [pendingChanges]);

  // Map the persisted records onto the shapes the panels render.
  const datasetsByAgent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of datasets) {
      if (!d.agent_id) continue;
      const arr = m.get(d.agent_id) ?? [];
      arr.push(d.name);
      m.set(d.agent_id, arr);
    }
    return m;
  }, [datasets]);

  const uiAgents: Agent[] = useMemo(
    () =>
      agents.map((a) => ({
        id: a.id,
        name: a.name,
        initial: (a.name.charAt(0) || "?").toUpperCase(),
        avatarBg: a.avatar_bg ?? pickColor(a.name),
        statusLabel: a.status === "active" ? "Active" : "Paused",
        statusColor: a.status === "active" ? C.green : C.gold,
        statusDot: a.status === "active" ? C.green : C.gold,
        channels: a.channels,
        modeLabel: a.mode === "auto" ? "Auto" : "On ping",
        purpose: a.purpose_text ?? "",
        feeds: (datasetsByAgent.get(a.id) ?? []).join(" · ") || "—",
        pending: pendingByAgent.get(a.name) ?? 0,
      })),
    [agents, datasetsByAgent, pendingByAgent],
  );

  const uiTables: TableInfo[] = useMemo(
    () =>
      datasets.map((d) => ({
        id: d.id,
        name: d.name,
        rows: `${d.rowCount} ${d.rowCount === 1 ? "row" : "rows"}`,
        fields: d.columns.map((c) => c.label),
        agent: d.agentName ?? "—",
        agentInitial: (d.agentName?.charAt(0) ?? "—").toUpperCase(),
        agentBg: pickColor(d.agentName ?? d.name),
        updated: relTime(d.updated_at),
      })),
    [datasets],
  );

  const populated = uiAgents.length > 0;
  const activeCount = agents.filter((a) => a.status === "active").length;

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [purposeText, setPurposeText] = useState("");
  const [channels, setChannels] = useState<string[]>(["gmail", "outlook"]);
  const [mode, setMode] = useState<"auto" | "ping">("auto");
  const [purpose, setPurpose] = useState<"curate" | "auto">("curate");
  const [targetTables, setTargetTables] = useState<string[]>([]);
  const [freestyle, setFreestyle] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  // Manage-agent / table-editor / create-table / bulk-export state.
  const [manageAgentId, setManageAgentId] = useState<string | null>(null);
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [importGraphOpen, setImportGraphOpen] = useState(false);
  const [contextDismissed, setContextDismissed] = useState(false);
  const onboardingTrack = Array.isArray(onboarding.answers?.track) ? (onboarding.answers.track as string[]) : [];
  const hasContext = !!onboarding.businessContext;
  const [buildOpen, setBuildOpen] = useState(false);
  const [dataView, setDataView] = useState<DataView>("tables");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const manageAgent = agents.find((a) => a.id === manageAgentId) ?? null;
  const openTable = datasets.find((d) => d.id === openTableId) ?? null;

  const cloud = settings.computeMode === "cloud";

  const openModal = () => {
    setStep(1);
    setName("");
    setPurposeText("");
    setCreateError(null);
    setModalOpen(true);
  };
  const submitAgent = () => {
    setCreateError(null);
    if (!name.trim()) {
      setCreateError("Give the agent a name.");
      return;
    }
    startSubmit(async () => {
      const res = await createAgentAction({
        name: name.trim(),
        purposeText,
        purpose,
        channels,
        mode,
        freestyle,
        targetDatasetNames: freestyle ? [] : targetTables,
      });
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }
      setModalOpen(false);
      setStep(1);
      router.refresh();
    });
  };
  const nextStep = () => {
    if (step >= 4) submitAgent();
    else setStep(step + 1);
  };
  const prevStep = () => setStep(Math.max(1, step - 1));
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const pendingCount = pendingChanges.length;
  const pendingTables = new Set(pendingChanges.map((p) => p.datasetId)).size;
  const pendingAgents = new Set(pendingChanges.map((p) => p.agent)).size;

  // Review is FACT-level (merges / conflicts / extractions). Tables are a
  // projection of accepted facts, not a separate review surface.
  const reviewTotal = pendingReviewCount;

  const titles: Record<Tab, { t: string; sub: string }> = {
    agents: { t: "Agents", sub: populated ? `${activeCount} of ${uiAgents.length} running · watching your channels` : "No agents yet — create your first one" },
    data: { t: "Data", sub: dataView === "knowledge" ? "The people, companies & things we know about — your tables are built from these" : dataView === "insights" ? "The numbers behind your knowledge — totals & breakdowns, computed live" : dataView === "files" ? "Documents that arrived as attachments — filed by what they mention, originals kept" : uiTables.length ? `${uiTables.length} ${uiTables.length === 1 ? "table" : "tables"} · derived from your knowledge` : "No tables yet" },
    review: { t: "Review", sub: reviewTotal ? `${reviewTotal} to confirm — merges, conflicts & new facts` : "Confirm what we inferred — merges, conflicts & new facts" },
    search: { t: "Search", sub: "Ask anything across everything your agents have captured" },
  };

  const providerLabel = settings.aiProvider === "openai" ? "OpenAI" : settings.aiProvider === "openrouter" ? "OpenRouter" : "Claude";
  const runtimeLabel = cloud ? "Datamodo cloud" : `Your ${providerLabel} key`;
  const runtimeSub = cloud ? "We run every agent for you." : (settings.byokKeySet ? `Runs on your ${providerLabel} API key.` : "Add your API key to start.");
  const runtimeDot = cloud ? C.green : (settings.byokKeySet ? C.gold : C.accent);
  const plan = planLimits(settings.plan);

  return (
    <div className="cc-shell">
      {notice && noticeOpen && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 200, maxWidth: 620, width: "calc(100% - 24px)", display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", background: "#FBEFD6", border: "1px solid #E6CF92", borderRadius: 12, boxShadow: "0 12px 30px -12px rgba(33,30,24,.4)" }}>
          <span style={{ fontSize: 15, lineHeight: 1.3, flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 12.5, color: "#6B551F", lineHeight: 1.4, flex: 1 }}>{notice}</span>
          <button type="button" onClick={() => setNoticeOpen(false)} style={{ border: "none", background: "none", color: "#9A8043", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }} title="Dismiss">✕</button>
        </div>
      )}
      {/* ================= SIDEBAR ================= */}
      <aside className="cc-side">
        <div style={{ padding: "2px 8px 22px", display: "flex", alignItems: "baseline" }}>
          <span className="dm-script" style={{ fontWeight: 700, fontSize: 27, lineHeight: 1, color: "#F1ECE1", display: "inline-block", transform: "rotate(-4deg)", marginRight: 1 }}>data</span>
          <span className="dm-display" style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.03em", color: "#F1ECE1" }}>modo</span>
        </div>

        {/* New agent + workspace nav — a plain stack on desktop; on mobile
            this whole group becomes one horizontally-scrollable row so the
            action and the tabs stay aligned together. */}
        <div className="cc-navgroup">
        <Hov
          onClick={openModal}
          className="cc-new"
          base={{ display: "flex", alignItems: "center", gap: 10, background: "#2B2720", border: "none", borderRadius: 11, padding: "11px 12px", color: "#F1ECE1", fontFamily: "inherit", fontSize: 14, fontWeight: 500, marginBottom: 22, cursor: "pointer", width: "100%", textAlign: "left" }}
          hover={{ background: "#322D25" }}
        >
          <span style={{ width: 24, height: 24, borderRadius: 7, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, lineHeight: 1 }}>+</span>
          New agent
        </Hov>

        <p className="dm-mono cc-side-label" style={{ ...monoLabel, letterSpacing: "0.09em", padding: "0 8px 8px", margin: 0, color: "#7C766B" }}>Menu</p>
        <nav className="cc-nav" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {([
            { key: "agents", label: "Agents", count: uiAgents.length ? String(uiAgents.length) : null, icon: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" /><path d="M9 14h.01M15 14h.01" /></> },
            { key: "data", label: "Data", count: uiTables.length ? String(uiTables.length) : null, icon: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 10h18M9 4v16" /></> },
            { key: "review", label: "Review", count: reviewTotal ? String(reviewTotal) : null, icon: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> },
            { key: "search", label: "Search", count: null, icon: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></> },
          ] as const).map((item) => {
            const active = tab === item.key;
            return (
              <Hov
                key={item.key}
                onClick={() => setTab(item.key)}
                base={navStyle(active)}
                hover={active ? undefined : { background: "#2B2720", color: "#F1ECE1" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 11, color: active ? C.accent : "#8A8477" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
                  <span style={{ color: active ? "#F1ECE1" : "#B7AF9F" }}>{item.label}</span>
                </span>
                {item.count && <span className="dm-mono" style={{ fontSize: 11, color: active ? "#8A8477" : "#7C766B" }}>{item.count}</span>}
              </Hov>
            );
          })}
        </nav>
        </div>

        {reviewTotal > 0 && (
        <div className="cc-review" style={{ marginTop: 26 }}>
          <p className="dm-mono" style={{ ...monoLabel, letterSpacing: "0.09em", padding: "0 8px 8px", margin: 0, color: "#7C766B" }}>Needs review</p>
          <Hov
            onClick={() => setTab("review")}
            base={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: "9px 10px", borderRadius: 9, color: "#B7AF9F", fontFamily: "inherit", fontSize: 14, cursor: "pointer", textAlign: "left" }}
            hover={{ background: "#2B2720", color: "#F1ECE1" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, animation: "cc-pulse 2.6s ease-in-out infinite" }} />
              Pending changes
            </span>
            <span className="dm-mono" style={{ fontSize: 11, color: "#fff", background: C.accent, borderRadius: 999, padding: "1px 8px" }}>{reviewTotal}</span>
          </Hov>
        </div>
        )}

        {/* runtime / compute */}
        <div className="cc-compute" style={{ marginTop: "auto", background: "#2B2720", border: "1px solid #3A352C", borderRadius: 12, padding: "11px 12px", marginBottom: 14 }}>
          <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C766B", marginBottom: 7 }}>Compute · account-wide</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: runtimeDot, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#F1ECE1", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{runtimeLabel}</span>
            </div>
            <Hov onClick={() => setSettingsOpen(true)} tag="button" base={{ background: "none", border: "none", fontSize: 10.5, color: "#A39B8B", cursor: "pointer", flexShrink: 0 }} hover={{ color: "#F1ECE1" }}>
              <span className="dm-mono">manage</span>
            </Hov>
          </div>
          <div style={{ fontSize: 11, color: "#7C766B", marginTop: 5, lineHeight: 1.35 }}>{runtimeSub}</div>
        </div>

        {/* user */}
        <div className="cc-user" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: "1px solid #3A352C" }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{initial}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#F1ECE1", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</div>
            <button type="button" onClick={() => setSettingsOpen(true)} className="dm-mono" style={{ fontSize: 10.5, color: "#7C766B", background: "none", border: "none", padding: 0, cursor: "pointer" }}>{plan.label} plan · manage</button>
          </div>
          <form action={signout} style={{ marginLeft: "auto" }}>
            <Hov tag="button" type="submit" title="Sign out" base={{ background: "none", border: "none", color: "#7C766B", fontSize: 11, cursor: "pointer" }} hover={{ color: "#F1ECE1" }}>
              <span className="dm-mono">Sign out</span>
            </Hov>
          </form>
        </div>
      </aside>

      {/* ================= MAIN ================= */}
      <main className="cc-main">
        {/* topbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 26px", borderBottom: "1px solid #E7E0D2", background: "#F6F2E9", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="dm-display" style={{ fontWeight: 700, fontSize: 21, letterSpacing: "-0.025em", lineHeight: 1.1 }}>{titles[tab].t}</div>
            <div style={{ fontSize: 13, color: "#8A8477", marginTop: 2 }}>{titles[tab].sub}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <Hov onClick={() => setOnboardingOpen(true)} title={hasContext ? "Edit your business context" : "Tell your agents what matters"} base={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 500, color: "#3A352C", background: "#fff", border: "1px solid #E1D9C8", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit" }} hover={{ background: "#FBF8F1" }}>
              <span style={{ color: C.accent }}>✦</span>
              Context{hasContext && <span style={{ color: C.green, fontSize: 13, lineHeight: 1 }}>✓</span>}
            </Hov>
            <Hov onClick={() => setConnectionsOpen(true)} base={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 500, color: "#3A352C", background: "#fff", border: "1px solid #E1D9C8", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit" }} hover={{ background: "#FBF8F1" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></svg>
              Connect
            </Hov>
            <div className="dm-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6B665B", background: "#fff", border: "1px solid #E1D9C8", borderRadius: 10, padding: "8px 12px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />{inbox}
            </div>
          </div>
        </div>

        <div className="cc-scroll" style={{ padding: "24px 26px", overflow: "auto", flex: 1 }}>
          {!hasContext && !contextDismissed && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "linear-gradient(#FDF6F2,#FDF1EC)", border: "1px solid #F3D6CB", borderRadius: 14, padding: "13px 16px", marginBottom: 18 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>✦</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>Tell your agents what matters</div>
                <div style={{ fontSize: 12.5, color: "#8A6a5f", marginTop: 1 }}>A sentence about your business sharpens what we extract from your messages.</div>
              </div>
              <Hov onClick={() => setOnboardingOpen(true)} base={{ ...primaryBtn(false), padding: "9px 16px", fontSize: 13, boxShadow: "none" }} hover={{ background: C.accentPress }}>Set it up</Hov>
              <Hov onClick={() => setContextDismissed(true)} tag="button" base={{ background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }} hover={{ color: C.ink }}>Later</Hov>
            </div>
          )}
          {tab === "agents" && (populated ? <AgentsFull agents={uiAgents} activity={agentActivity} autoAccept={autoAccept} setAutoAccept={setAutoAccept} expanded={expanded} setExpanded={setExpanded} openModal={openModal} onManage={setManageAgentId} onReview={() => setTab("review")} pendingCount={pendingCount} /> : <AgentsEmpty openModal={openModal} inbox={inbox} />)}
          {tab === "data" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <Segmented value={dataView} onChange={setDataView} options={[{ v: "tables", label: "Tables" }, { v: "knowledge", label: "Knowledge" }, { v: "insights", label: "Insights" }, { v: "files", label: "Files" }]} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Hov onClick={() => setImportGraphOpen(true)} base={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 7 }} hover={{ background: "#FBF8F1" }}>
                    <span style={{ color: C.accent }}>✦</span> Spreadsheet → knowledge
                  </Hov>
                  <Hov onClick={() => setBuildOpen(true)} base={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 7 }} hover={{ background: "#FBF8F1" }}>
                    <span style={{ color: C.accent }}>✦</span> Build from knowledge
                  </Hov>
                </div>
              </div>
              {dataView === "knowledge" ? (
                <KnowledgeView />
              ) : dataView === "insights" ? (
                <InsightsView />
              ) : dataView === "files" ? (
                <FilesView />
              ) : uiTables.length || createTableOpen ? (
                <>
                  {uiTables.length > 0 && <RelationshipGraph tables={uiTables} relations={relations} datasets={datasets} onOpen={setOpenTableId} onChanged={() => router.refresh()} />}
                  <DataFull tables={uiTables} onOpen={setOpenTableId} onCreate={() => setCreateTableOpen(true)} onImported={() => router.refresh()} selected={selectedTables} toggleSelect={(id) => setSelectedTables((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])} />
                </>
              ) : <DataEmpty openModal={() => setCreateTableOpen(true)} />}
            </>
          )}
          {tab === "review" && <ReviewStudio />}
          {tab === "search" && <SearchTab onOpenTable={setOpenTableId} />}
        </div>
      </main>

      {/* ================= CREATE AGENT MODAL ================= */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, alignItems: "center", justifyContent: "center", padding: 24, display: "flex" }}>
          <div onClick={() => setModalOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(33,30,24,.5)", backdropFilter: "blur(2px)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 600, background: "#F6F2E9", border: "1px solid #E1D9C8", borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 90px -40px rgba(33,30,24,.7)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px" }}>
              <div>
                <div className="dm-display" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.025em" }}>New agent</div>
                <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginTop: 2 }}>Step {step} of 4 · {["Channels", "Access", "Purpose", "Review"][step - 1]}</div>
              </div>
              <Hov onClick={() => setModalOpen(false)} base={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #E1D9C8", background: "#fff", color: "#8A8477", cursor: "pointer", fontSize: 15, lineHeight: 1 }} hover={{ background: "#FBF8F1", color: C.ink }}>✕</Hov>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "0 24px 18px" }}>
              {[1, 2, 3, 4].map((n) => <span key={n} style={bar(step >= n)} />)}
            </div>

            <div className="cc-scroll" style={{ padding: "4px 24px 8px", overflow: "auto" }}>
              {step === 1 && (
                <ModalStep1 name={name} setName={setName} channels={channels} setChannels={setChannels} toggle={toggle} />
              )}
              {step === 2 && (
                <ModalStep2 mode={mode} setMode={setMode} />
              )}
              {step === 3 && (
                <ModalStep3 purposeText={purposeText} setPurposeText={setPurposeText} tables={uiTables} purpose={purpose} setPurpose={setPurpose} freestyle={freestyle} setFreestyle={setFreestyle} targetTables={targetTables} setTargetTables={setTargetTables} toggle={toggle} />
              )}
              {step === 4 && (
                <ModalStep4 channels={channels} mode={mode} purpose={purpose} freestyle={freestyle} targetTables={targetTables} runtimeDot={runtimeDot} runtimeLabel={runtimeLabel} />
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 24px 20px", borderTop: "1px solid #E7E0D2", background: "#F0EBDE" }}>
              <button type="button" onClick={prevStep} style={{ background: "none", border: "none", color: step === 1 ? "#C9C1B2" : "#57534A", fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "11px 8px" }}>Back</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                {createError && <span className="dm-mono" style={{ fontSize: 11, color: C.accent, textAlign: "right", maxWidth: 200 }}>{createError}</span>}
                <Hov onClick={submitting ? undefined : nextStep} base={{ background: C.accent, color: "#fff8f4", border: "none", borderRadius: 11, padding: "11px 22px", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1, boxShadow: "0 6px 16px rgba(228,89,59,.28)" }} hover={{ background: C.accentPress }}>
                  {step >= 4 ? (submitting ? "Creating…" : "Create agent") : "Continue"}
                </Hov>
              </div>
            </div>
          </div>
        </div>
      )}

      {manageAgent && (
        <AgentEditModal
          agent={manageAgent}
          onClose={() => setManageAgentId(null)}
          onSaved={() => { setManageAgentId(null); router.refresh(); }}
        />
      )}
      {openTable && (
        <TableDetailModal
          table={openTable}
          onClose={() => setOpenTableId(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {createTableOpen && (
        <CreateTableModal
          onClose={() => setCreateTableOpen(false)}
          onCreated={() => { setCreateTableOpen(false); router.refresh(); }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => { setSettingsOpen(false); router.refresh(); }}
        />
      )}
      {connectionsOpen && <ConnectionsModal inbox={inbox} onClose={() => setConnectionsOpen(false)} />}
      {onboardingOpen && <OnboardingModal initialContext={onboarding.businessContext} initialTrack={onboardingTrack} onClose={() => setOnboardingOpen(false)} onSaved={() => { setOnboardingOpen(false); router.refresh(); }} onImportSpreadsheet={() => { setOnboardingOpen(false); setImportGraphOpen(true); }} />}
      {importGraphOpen && <ImportGraphModal onClose={() => setImportGraphOpen(false)} onDone={() => router.refresh()} />}
      {buildOpen && (
        <BuildFromKnowledgeModal
          datasets={datasets.map((d) => ({ id: d.id, name: d.name, columns: d.columns }))}
          onClose={() => setBuildOpen(false)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* AGENTS TAB                                                          */
/* ================================================================== */
function AgentsFull({ agents, activity, autoAccept, setAutoAccept, expanded, setExpanded, openModal, onManage, onReview, pendingCount }: {
  agents: Agent[];
  activity: Record<string, AgentActivityEntry[]>;
  autoAccept: boolean;
  setAutoAccept: (v: boolean) => void;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  openModal: () => void;
  onManage: (id: string) => void;
  onReview: () => void;
  pendingCount: number;
}) {
  return (
    <div>
      {/* Pending-review banner — links to the unified Review surface. */}
      {pendingCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, padding: "14px 16px", background: "#FDF4F0", border: "1px solid #F3D6CB", borderRadius: 14, flexWrap: "wrap" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.accent, animation: "cc-pulse 2.6s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>{pendingCount} change{pendingCount === 1 ? "" : "s"} waiting for your review across your tables.</span>
          <Hov onClick={onReview} base={{ marginLeft: "auto", background: C.accent, color: "#fff8f4", border: "none", borderRadius: 10, padding: "8px 16px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }} hover={{ background: C.accentPress }}>Review changes →</Hov>
        </div>
      )}

      {/* AGENT GRID */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
        <span className="dm-display" style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>Your agents</span>
        <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>{agents.length}</span>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13, color: "#57534A" }}>
          Auto-accept from trusted agents
          <span onClick={() => setAutoAccept(!autoAccept)} style={toggleTrack(autoAccept)}>
            <span style={toggleKnob(autoAccept)} />
          </span>
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(268px,1fr))", gap: 16 }}>
        {agents.map((a) => <AgentCard key={a.id} a={a} onManage={onManage} activity={activity[a.name] ?? []} expanded={expanded === a.id} onToggle={() => setExpanded(expanded === a.id ? null : a.id)} />)}
        <Hov onClick={openModal} base={{ background: "none", border: "1.5px dashed #D8CFBD", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", minHeight: 180, color: "#8A8477", fontFamily: "inherit", transition: "border-color .15s ease, background .15s ease" }} hover={{ border: `1.5px dashed ${C.accent}`, background: "#FDF1EC", color: C.accent }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: "#F1EDE4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>New agent</span>
          <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", textAlign: "center" }}>watch a channel, fill a table</span>
        </Hov>
      </div>
    </div>
  );
}

function AgentCard({ a, onManage, activity, expanded, onToggle }: { a: Agent; onManage: (id: string) => void; activity: AgentActivityEntry[]; expanded: boolean; onToggle: () => void }) {
  const accent = a.modeLabel === "Auto";
  const modePill: CSSProperties = {
    fontSize: 10.5,
    padding: "3px 9px",
    borderRadius: 999,
    ...(accent
      ? { color: C.accent, background: "#FDF1EC", border: "1px solid #F3D6CB" }
      : { color: "#57534A", background: "#F6F2E9", border: "1px solid #E7E0D2" }),
  };
  const pendBadge: CSSProperties = a.pending > 0
    ? { fontSize: 10.5, color: C.accent, background: "#FDF1EC", border: "1px solid #F3D6CB", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }
    : { fontSize: 10.5, color: "#A39B8B", flexShrink: 0 };

  return (
    <Hov tag="div" onClick={() => onManage(a.id)} base={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 14, cursor: "pointer", transition: "box-shadow .15s ease, transform .15s ease" }} hover={{ boxShadow: "0 20px 40px -30px rgba(33,30,24,.4)", transform: "translateY(-2px)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span className="dm-display" style={{ width: 40, height: 40, borderRadius: 12, background: a.avatarBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 17, flexShrink: 0 }}>{a.initial}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>{a.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.statusDot }} />
            <span className="dm-mono" style={{ fontSize: 11, color: a.statusColor }}>{a.statusLabel}</span>
          </div>
        </div>
        <span title="Manage" style={{ color: "#B7AF9F", fontSize: 16, lineHeight: 1, padding: 2 }}>⋯</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#57534A", lineHeight: 1.45, minHeight: 38 }}>{a.purpose}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="dm-mono" style={modePill}>{a.modeLabel}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 2 }}>
          {a.channels.map((c) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={c} src={LOGO[c]} alt={CH_NAMES[c]} title={CH_NAMES[c]} style={{ width: 18, height: 18, borderRadius: 4 }} />
          ))}
        </div>
      </div>

      {/* Recent activity — what this agent has parsed & proposed lately. */}
      {activity.length > 0 && (
        <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid #F1EDE4", paddingTop: 10 }}>
          <button type="button" onClick={onToggle} style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <span className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B" }}>Recent activity</span>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>{activity.length} · {expanded ? "hide" : "show"}</span>
          </button>
          {expanded && (
            <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 9 }}>
              {activity.map((e) => (
                <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: e.kind === "pending" ? C.accent : C.green }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#3A352C", lineHeight: 1.4 }}>{e.summary}</div>
                    <div className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", marginTop: 1 }}>{e.datasetName} · {e.kind === "pending" ? "pending review" : "applied"} · {relTime(e.when)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ borderTop: "1px solid #F1EDE4", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477", display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}><span style={{ color: "#C98467" }}>→</span><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.feeds}</span></span>
        <span className="dm-mono" style={pendBadge}>{a.pending > 0 ? `${a.pending} pending` : "up to date"}</span>
      </div>
    </Hov>
  );
}

function AgentsEmpty({ openModal, inbox }: { openModal: () => void; inbox: string }) {
  const steps = [
    { n: "01", t: "Pick a channel", d: "Gmail, Outlook, WhatsApp, Slack or Teams." },
    { n: "02", t: "Tell it what to watch", d: "Auto, or ping it when you want something saved." },
    { n: "03", t: "It fills your tables", d: "Structured rows you can query, export or sync." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "44px 20px 60px" }}>
      <div className="dm-bob" style={{ width: 70, height: 70, borderRadius: 20, background: "#FDF1EC", border: "1px solid #F3D6CB", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1.4" fill={C.accent} stroke="none" /><path d="M9 14h.01M15 14h.01" /></svg>
      </div>
      <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 30, letterSpacing: "-0.03em", margin: "0 0 10px" }}>Create your first agent</h2>
      <p style={{ fontSize: 15.5, color: "#57534A", maxWidth: "46ch", margin: "0 0 30px", lineHeight: 1.55 }}>An agent quietly watches one of your channels and turns the messages you care about into clean, tabular data — no copy-paste, ever.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, maxWidth: 640, width: "100%", marginBottom: 32 }}>
        {steps.map((s) => (
          <div key={s.n} style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 14, padding: "18px 16px", textAlign: "left" }}>
            <div className="dm-mono" style={{ fontSize: 11, color: C.accent, marginBottom: 8 }}>{s.n}</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.t}</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", lineHeight: 1.45 }}>{s.d}</div>
          </div>
        ))}
      </div>
      <Hov onClick={openModal} base={{ background: C.accent, color: "#fff8f4", border: "none", borderRadius: 12, padding: "14px 26px", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 6px 18px rgba(228,89,59,.28)" }} hover={{ background: C.accentPress }}>Create an agent</Hov>
      <div className="dm-mono" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, fontSize: 12, color: "#8A8477" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
        or forward anything to <span style={{ color: C.ink }}>{inbox}</span>
      </div>
    </div>
  );
}

/* ================================================================== */
/* DATA TAB                                                            */
/* ================================================================== */
type ImportDone = { mode: string; datasetId?: string; added?: number; changed?: number; rows?: number };

/**
 * Upload a spreadsheet to seed a new table, or to sync one (incoming rows land
 * as reviewable proposals). v1 stand-in for the live Google Sheets pull.
 */
function ImportSheetButton({ datasetId, label, style, hoverStyle, onDone }: {
  datasetId?: string;
  label: ReactNode;
  style: CSSProperties;
  hoverStyle?: CSSProperties;
  onDone: (r: ImportDone) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (datasetId) fd.append("datasetId", datasetId);
      const res = await fetch("/api/datasets/import", { method: "POST", body: fd });
      const data = (await res.json()) as ImportDone & { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) { setErr(data.error ?? "Import failed."); return; }
      onDone(data);
    } catch {
      setErr("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx" onChange={onFile} style={{ display: "none" }} />
      <Hov onClick={busy ? undefined : () => inputRef.current?.click()} base={style} hover={hoverStyle}>
        {busy ? "Importing…" : label}
      </Hov>
      {err && <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{err}</span>}
    </>
  );
}

function DataFull({ tables, onOpen, onCreate, onImported, selected, toggleSelect }: {
  tables: TableInfo[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onImported: () => void;
  selected: string[];
  toggleSelect: (id: string) => void;
}) {
  const feeding = new Set(tables.map((t) => t.agent).filter((a) => a && a !== "—")).size;
  const exportAllHref = "/api/datasets/export";
  const exportSelectedHref = `/api/datasets/export?ids=${selected.join(",")}`;
  return (
    <div>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        <span className="dm-mono" style={{ fontSize: 12, color: "#8A8477" }}>{tables.length} {tables.length === 1 ? "table" : "tables"} · {feeding} {feeding === 1 ? "agent" : "agents"} feeding them</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          {selected.length > 0 && (
            <Hov tag="a" href={exportSelectedHref} base={{ ...exportBtn, textDecoration: "none", color: C.accent, borderColor: "#F3D6CB", background: "#FDF1EC" }} hover={{ background: "#FBE7DF" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
              Export {selected.length} selected
            </Hov>
          )}
          <Hov tag="a" href={exportAllHref} base={{ ...exportBtn, textDecoration: "none" }} hover={{ background: "#FBF8F1", border: "1px solid #D8CFBD" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1E8E4E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 9v12" /></svg>
            Export all (Excel)
          </Hov>
          <ImportSheetButton
            label={<><span style={{ fontSize: 14, lineHeight: 1 }}>↥</span> Import sheet</>}
            style={{ ...exportBtn, display: "inline-flex", alignItems: "center", gap: 6 }}
            hoverStyle={{ background: "#FBF8F1", border: "1px solid #D8CFBD" }}
            onDone={onImported}
          />
          <Hov onClick={onCreate} base={{ ...exportBtn, background: C.ink, color: "#F1ECE1", border: `1px solid ${C.ink}` }} hover={{ background: "#322D25" }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New table
          </Hov>
        </div>
      </div>

      {/* table cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16, marginBottom: 24 }}>
        {tables.map((t) => {
          const sel = selected.includes(t.id);
          return (
          <div key={t.id} style={{ background: "#fff", border: sel ? `1px solid ${C.accent}` : "1px solid #E7E0D2", borderRadius: 16, padding: "16px 17px", display: "flex", flexDirection: "column", gap: 12, transition: "box-shadow .15s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span onClick={() => toggleSelect(t.id)} title="Select" style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, ...(sel ? { background: C.accent, color: "#fff", border: `1px solid ${C.accent}` } : { background: "#fff", color: "transparent", border: "1.5px solid #D8CFBD" }) }}>✓</span>
                <button type="button" onClick={() => onOpen(t.id)} title="Open table" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <span className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: C.ink }}>{t.name}</span>
                </button>
              </div>
              <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>{t.rows}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {t.fields.map((f) => (
                <span key={f} className="dm-mono" style={{ fontSize: 10.5, color: "#57534A", background: "#F6F2E9", border: "1px solid #ECE5D8", borderRadius: 6, padding: "3px 7px" }}>{f}</span>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #F1EDE4", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: t.agentBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{t.agentInitial}</span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.agent}</span>
              </span>
              <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>{t.updated}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Hov onClick={() => onOpen(t.id)} base={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#F6F2E9", border: "1px solid #E7E0D2", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 500, color: "#3A352C", cursor: "pointer" }} hover={{ background: "#EFE9DC" }}>
                Open & edit
              </Hov>
              <Hov tag="a" href={`/api/datasets/${t.id}/export`} base={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", background: "#fff", border: "1px solid #E1D9C8", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 500, color: "#3A352C", cursor: "pointer" }} hover={{ background: "#FBF8F1", border: "1px solid #D8CFBD" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1E8E4E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 9v12" /></svg>
                Excel
              </Hov>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
const exportBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  background: "#fff",
  border: "1px solid #E1D9C8",
  borderRadius: 9,
  padding: "7px 12px",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 500,
  color: "#3A352C",
  cursor: "pointer",
  transition: "background .15s ease, border-color .15s ease",
};

function DataEmpty({ openModal }: { openModal: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 20px" }}>
      <div className="dm-bob" style={{ width: 64, height: 64, borderRadius: 18, background: "#F6F2E9", border: "1px solid #E7E0D2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#A39B8B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 10h18M9 4v16" /></svg>
      </div>
      <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.03em", margin: "0 0 8px" }}>No tables yet</h2>
      <p style={{ fontSize: 15, color: "#57534A", maxWidth: "40ch", margin: "0 0 24px", lineHeight: 1.55 }}>Tables appear automatically the moment your first agent captures something. Create an agent to get started.</p>
      <Hov onClick={openModal} base={{ background: C.accent, color: "#fff8f4", border: "none", borderRadius: 12, padding: "12px 22px", fontFamily: "inherit", fontSize: 14.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 6px 18px rgba(228,89,59,.28)" }} hover={{ background: C.accentPress }}>Create an agent</Hov>
    </div>
  );
}

/* ================================================================== */
/* SEARCH TAB                                                          */
/* ================================================================== */
const SEARCH_EXAMPLES = ["Which trips are still unpaid?", "Everyone I know at Acme", "Invoices over 1000"];

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Render `text` with any matched query terms wrapped in a soft highlight. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${terms.map(escRe).join("|")})`, "ig"));
  const set = new Set(terms.map((t) => t.toLowerCase()));
  return (
    <>
      {parts.map((p, i) =>
        set.has(p.toLowerCase())
          ? <mark key={i} style={{ background: "#FBE7C6", color: C.ink, borderRadius: 3, padding: "0 1px" }}>{p}</mark>
          : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

function HitCard({ hit, terms, onOpen }: { hit: SearchHit; terms: string[]; onOpen: () => void }) {
  const cells = hit.cells.filter((c) => c.value !== "" || c.matched);
  return (
    <Hov onClick={onOpen} className="dm-card dm-card-tap" base={{ textAlign: "left", width: "100%", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 13, padding: "13px 16px", cursor: "pointer", fontFamily: "inherit", display: "block" }} hover={{ border: "1px solid #F3D6CB", background: "#FDF9F2" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: C.ink, background: "#F6F2E9", border: "1px solid #E7E0D2", borderRadius: 7, padding: "3px 9px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 10h18M9 4v16" /></svg>
          {hit.datasetName}
        </span>
        <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginLeft: "auto" }}>open →</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 13 }}>
        {cells.map((c) => (
          <Fragment key={c.column}>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", whiteSpace: "nowrap" }}>{c.label}</span>
            <span style={{ color: c.matched ? C.ink : "#57534A", fontWeight: c.matched ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.value ? <Highlight text={c.value} terms={terms} /> : <span style={{ color: "#C9BCA6" }}>—</span>}
            </span>
          </Fragment>
        ))}
      </div>
    </Hov>
  );
}

type SearchResponse = SearchResult & { entities: KnowledgeHit[] };

const KNOWLEDGE_TONE: Record<string, string> = { person: C.blue, people: C.blue, company: C.accent, org: C.accent, organization: C.accent, invoice: C.gold, project: C.green };
const knowledgeTone = (k: string) => KNOWLEDGE_TONE[k.toLowerCase()] ?? C.ink;

function KnowledgeHitCard({ hit, terms }: { hit: KnowledgeHit; terms: string[] }) {
  const tone = knowledgeTone(hit.kind);
  const facts = [...hit.facts].sort((a, b) => Number(b.matched) - Number(a.matched)).slice(0, 4);
  return (
    <div className="dm-card" style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 13, padding: "12px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: facts.length ? 9 : 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: tone, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{hit.label.charAt(0).toUpperCase()}</span>
        <span className="dm-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}><Highlight text={hit.label} terms={terms} /></span>
        <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A39B8B" }}>{hit.kind}</span>
      </div>
      {facts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px", fontSize: 12.5, paddingLeft: 35 }}>
          {facts.map((f, i) => (
            <Fragment key={i}>
              <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", whiteSpace: "nowrap" }}>{f.predicate.replace(/_/g, " ")}</span>
              <span style={{ color: f.ref ? C.accent : "#3A352C", fontWeight: f.matched ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis" }}>{f.ref ? "→ " : ""}<Highlight text={f.value} terms={terms} /></span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchTab({ onOpenTable }: { onOpenTable: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (query: string) => {
    const term = query.trim();
    setSubmitted(term);
    if (!term) { setResult(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const json = (await res.json()) as Partial<SearchResponse>;
      setResult({ query: json.query ?? term, terms: json.terms ?? [], total: json.total ?? 0, hits: json.hits ?? [], entities: json.entities ?? [] });
    } catch {
      setResult({ query: term, terms: [], total: 0, hits: [], entities: [] });
    } finally {
      setLoading(false);
    }
  };

  const ask = (query: string) => { setQ(query); void run(query); };

  return (
    <div style={{ maxWidth: 820 }}>
      <form onSubmit={(e) => { e.preventDefault(); void run(q); }} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 13, padding: "12px 14px", boxShadow: "0 18px 44px -34px rgba(33,30,24,.35)" }}>
        <span style={{ color: C.accent, fontSize: 16 }}>✦</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search everything — a name, company, amount…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 15.5, color: C.ink }} />
        <button type="submit" className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", border: "1px solid #E1D9C8", borderRadius: 6, padding: "4px 9px", background: "#fff", cursor: "pointer" }}>Ask ↵</button>
      </form>
      <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", margin: "9px 2px 0" }}>Searches your tables and everything your agents know. Plain-language answers with citations are coming.</div>

      {loading && <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "30px 4px" }}>Searching…</div>}

      {!loading && result && submitted && (
        result.total > 0 || result.entities.length > 0 ? (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 22 }}>
            {result.entities.length > 0 && (
              <div>
                <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 10 }}>In your knowledge · {result.entities.length}</div>
                <div className="dm-stagger" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.entities.map((e) => <KnowledgeHitCard key={e.id} hit={e} terms={result.terms} />)}
                </div>
              </div>
            )}
            {result.total > 0 && (
              <div>
                <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 10 }}>In your tables · {result.total}</div>
                <div className="dm-stagger" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.hits.map((h) => <HitCard key={h.rowId} hit={h} terms={result.terms} onOpen={() => onOpenTable(h.datasetId)} />)}
                </div>
                {result.total > result.hits.length && (
                  <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginTop: 12 }}>Showing the first {result.hits.length} of {result.total}.</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "56px 20px" }}>
            <div className="dm-bob" style={{ width: 58, height: 58, borderRadius: 17, background: "#F6F2E9", border: "1px solid #E7E0D2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#A39B8B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            </div>
            <h2 className="dm-display" style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em", margin: "0 0 6px" }}>No matches for “{submitted}”</h2>
            <p style={{ fontSize: 14, color: "#57534A", maxWidth: "40ch", margin: 0, lineHeight: 1.5 }}>Try a name, company, or amount from your messages or tables.</p>
          </div>
        )
      )}

      {!submitted && !loading && (
        <div style={{ marginTop: 22 }}>
          <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 10 }}>Try asking</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SEARCH_EXAMPLES.map((x) => (
              <Hov key={x} onClick={() => ask(x)} base={{ textAlign: "left", background: "#fff", border: "1px solid #E7E0D2", borderRadius: 11, padding: "12px 15px", fontFamily: "inherit", fontSize: 14, color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }} hover={{ border: "1px solid #F3D6CB", background: "#FDF1EC" }}>
                {x}<span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>search →</span>
              </Hov>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* MODAL STEPS                                                         */
/* ================================================================== */
function ModalStep1({ name, setName, channels, setChannels, toggle }: { name: string; setName: (v: string) => void; channels: string[]; setChannels: (v: string[]) => void; toggle: <T>(l: T[], v: T) => T[] }) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="dm-mono" style={{ ...monoLabel, marginBottom: 8 }}>Name</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ledger"
          style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 11, padding: "12px 14px", fontFamily: "inherit", fontSize: 14, color: C.ink, background: "#fff", outline: "none" }}
        />
      </div>
      <h3 className="dm-display" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", margin: "0 0 4px" }}>Which channels should it watch?</h3>
      <p style={{ fontSize: 13.5, color: "#8A8477", margin: "0 0 18px" }}>Pick one or more. The agent listens only to what you choose.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {Object.keys(LOGO).map((k) => {
          const active = channels.includes(k);
          return (
            <button key={k} type="button" onClick={() => setChannels(toggle(channels, k))} style={channelTile(active)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO[k]} alt={CH_NAMES[k]} style={{ width: 24, height: 24, borderRadius: 5 }} />
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{CH_NAMES[k]}</span>
              {active && <span style={{ position: "absolute", top: 8, right: 9, width: 16, height: 16, borderRadius: "50%", background: C.accent, color: "#fff", fontSize: 10, lineHeight: "16px", textAlign: "center" }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModalStep2({ mode, setMode }: {
  mode: "auto" | "ping"; setMode: (v: "auto" | "ping") => void;
}) {
  return (
    <div>
      <h3 className="dm-display" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", margin: "0 0 4px" }}>How much access does it get?</h3>
      <p style={{ fontSize: 13.5, color: "#8A8477", margin: "0 0 18px" }}>You can change this any time.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button type="button" onClick={() => setMode("auto")} style={modeCard(mode === "auto")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: "#FDF1EC", border: "1px solid #F3D6CB", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3.5" /></svg>
            </span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>Automatic</div>
              <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Reads every new message and saves what fits its purpose.</div>
            </div>
          </div>
          <span style={radioDot(mode === "auto")} />
        </button>
        <button type="button" onClick={() => setMode("ping")} style={modeCard(mode === "ping")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: "#F6F2E9", border: "1px solid #E7E0D2", display: "flex", alignItems: "center", justifyContent: "center", color: "#57534A", flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            </span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>On ping</div>
              <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Stays quiet until you tag or forward it something to save.</div>
            </div>
          </div>
          <span style={radioDot(mode === "ping")} />
        </button>
      </div>
    </div>
  );
}

function ModalStep3({ purposeText, setPurposeText, tables, purpose, setPurpose, freestyle, setFreestyle, targetTables, setTargetTables, toggle }: {
  purposeText: string; setPurposeText: (v: string) => void;
  tables: TableInfo[];
  purpose: "curate" | "auto"; setPurpose: (v: "curate" | "auto") => void;
  freestyle: boolean; setFreestyle: (v: boolean) => void;
  targetTables: string[]; setTargetTables: (v: string[]) => void; toggle: <T>(l: T[], v: T) => T[];
}) {
  const selectTable = (name: string) => {
    setFreestyle(false);
    setTargetTables(toggle(targetTables, name));
  };
  return (
    <div>
      <h3 className="dm-display" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", margin: "0 0 4px" }}>What should it capture?</h3>
      <p style={{ fontSize: 13.5, color: "#8A8477", margin: "0 0 18px" }}>Give it a focus, or let it read your general context.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button type="button" onClick={() => setPurpose("curate")} style={modeCard(purpose === "curate")}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Curate specific data</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Only save things that match a purpose you describe.</div>
          </div>
          <span style={radioDot(purpose === "curate")} />
        </button>
        {purpose === "curate" && (
          <div style={{ margin: "-4px 2px 0" }}>
            <input type="text" value={purposeText} onChange={(e) => setPurposeText(e.target.value)} placeholder="e.g. only invoices, receipts & payment confirmations" style={{ width: "100%", border: "1px solid #DDD5C5", borderRadius: 11, padding: "12px 14px", fontFamily: "inherit", fontSize: 14, color: C.ink, background: "#fff", outline: "none" }} />
          </div>
        )}
        <button type="button" onClick={() => setPurpose("auto")} style={modeCard(purpose === "auto")}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Auto from my context</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Learns what matters to you and organizes it on its own.</div>
          </div>
          <span style={radioDot(purpose === "auto")} />
        </button>
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="dm-mono" style={{ ...monoLabel, marginBottom: 10 }}>Feeds into an existing table</div>
        {tables.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {tables.map((t) => (
              <button key={t.name} type="button" onClick={() => selectTable(t.name)} className="dm-mono" style={targetChip(!freestyle && targetTables.includes(t.name), freestyle)}>
                {t.name} <span style={{ color: "#A39B8B", fontSize: 10 }}>{t.rows}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginBottom: 12 }}>No tables yet — pick Freestyle and the agent will create one.</div>
        )}
        <button type="button" onClick={() => { setFreestyle(true); setTargetTables([]); }} style={modeCard(freestyle)}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Freestyle</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Let the agent decide, and create new tables when it needs to.</div>
          </div>
          <span style={radioDot(freestyle)} />
        </button>
      </div>
    </div>
  );
}

function ModalStep4({ channels, mode, purpose, freestyle, targetTables, runtimeDot, runtimeLabel }: {
  channels: string[]; mode: "auto" | "ping";
  purpose: "curate" | "auto"; freestyle: boolean; targetTables: string[];
  runtimeDot: string; runtimeLabel: string;
}) {
  const reviewChannels = channels.length ? channels.map((k) => CH_NAMES[k]).join(", ") : "None selected";
  const reviewMode = mode === "auto" ? "Automatic — reads everything" : "On ping — only when tagged";
  const reviewPurpose = purpose === "curate" ? "Curated to a purpose" : "Auto from context";
  const reviewFeeds = freestyle ? "Freestyle · auto tables" : targetTables.length ? targetTables.join(", ") : "Auto tables";
  const rows = [
    { l: "Channels", v: reviewChannels },
    { l: "Access", v: reviewMode },
    { l: "Captures", v: reviewPurpose },
    { l: "Feeds into", v: reviewFeeds },
  ];
  return (
    <div>
      <h3 className="dm-display" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", margin: "0 0 4px" }}>Name your agent</h3>
      <p style={{ fontSize: 13.5, color: "#8A8477", margin: "0 0 18px" }}>Almost done.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span className="dm-display" style={{ width: 46, height: 46, borderRadius: 13, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19, flexShrink: 0 }}>L</span>
        <input type="text" defaultValue="Ledger" style={{ flex: 1, border: "1px solid #DDD5C5", borderRadius: 11, padding: "12px 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 500, color: C.ink, background: "#fff", outline: "none" }} />
      </div>
      <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 13, padding: "4px 16px" }}>
        {rows.map((r) => (
          <div key={r.l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F1EDE4" }}>
            <span style={{ fontSize: 13, color: "#8A8477" }}>{r.l}</span>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.v}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
          <span style={{ fontSize: 13, color: "#8A8477" }}>Runs on</span>
          <span className="dm-mono" style={{ fontSize: 12, color: "#57534A", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: runtimeDot }} />{runtimeLabel}</span>
        </div>
      </div>
      <div className="dm-mono" style={{ marginTop: 12, fontSize: 11, color: "#A39B8B", textAlign: "center" }}>Compute is account-wide · change it in the sidebar</div>
    </div>
  );
}

/* ================================================================== */
/* MANAGE / EDIT MODALS                                               */
/* ================================================================== */

function AgentEditModal({ agent, onClose, onSaved }: { agent: AgentRecord; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(agent.name);
  const [purposeText, setPurposeText] = useState(agent.purpose_text ?? "");
  const [channels, setChannels] = useState<string[]>(agent.channels);
  const [mode, setMode] = useState<"auto" | "ping">(agent.mode);
  const [status, setStatus] = useState<"active" | "paused">(agent.status);
  const { pending, error, run } = useAction();
  const toggleCh = (k: string) => setChannels((c) => c.includes(k) ? c.filter((x) => x !== k) : [...c, k]);
  const save = () => run(() => updateAgentAction(agent.id, { name, purposeText, channels, mode, status }), onSaved);
  const del = () => { if (confirm(`Delete agent “${agent.name}”? Its tables are kept.`)) run(() => deleteAgentAction(agent.id), onSaved); };

  return (
    <ModalShell title={agent.name} subtitle="Manage agent" onClose={onClose}
      badge={{ initial: agent.name.slice(0, 1).toUpperCase() || "A", bg: pickColor(agent.name) }}
      footer={(
        <>
          <Hov onClick={del} base={{ background: "none", border: "none", color: "#B44536", fontFamily: "inherit", fontSize: 13.5, fontWeight: 500, cursor: "pointer", padding: "8px 4px" }} hover={{ color: "#8f2f23" }}>Delete agent</Hov>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {error && <span className="dm-mono" style={{ fontSize: 11, color: C.accent, maxWidth: 200, textAlign: "right" }}>{error}</span>}
            <Hov onClick={pending ? undefined : save} base={primaryBtn(pending)} hover={{ background: C.accentPress }}>{pending ? "Saving…" : "Save"}</Hov>
          </div>
        </>
      )}
    >
      <div style={{ marginBottom: 16 }}>
        <div className="dm-mono" style={fieldLabel}>Name</div>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={fieldInput} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div className="dm-mono" style={fieldLabel}>Purpose</div>
        <textarea value={purposeText} onChange={(e) => setPurposeText(e.target.value)} rows={2} style={{ ...fieldInput, resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div className="dm-mono" style={fieldLabel}>Channels</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8 }}>
          {Object.keys(LOGO).map((k) => {
            const active = channels.includes(k);
            return (
              <button key={k} type="button" onClick={() => toggleCh(k)} style={channelTile(active)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO[k]} alt={CH_NAMES[k]} style={{ width: 20, height: 20, borderRadius: 4 }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{CH_NAMES[k]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div className="dm-mono" style={fieldLabel}>Mode</div>
          <Segmented value={mode} onChange={setMode} options={[{ v: "auto", label: "Automatic" }, { v: "ping", label: "On ping" }]} />
        </div>
        <div>
          <div className="dm-mono" style={fieldLabel}>Status</div>
          <Segmented value={status} onChange={setStatus} options={[{ v: "active", label: "Active" }, { v: "paused", label: "Paused" }]} />
        </div>
      </div>
    </ModalShell>
  );
}

function CreateTableModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [cols, setCols] = useState<{ label: string; type: string }[]>([{ label: "", type: "text" }]);
  const { pending, error, setError, run } = useAction();
  const update = (i: number, patch: Partial<{ label: string; type: string }>) => setCols((cs) => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  const create = () => {
    if (!name.trim()) { setError("Give the table a name."); return; }
    const seen = new Set<string>();
    const columns: DatasetColumn[] = cols.filter((c) => c.label.trim()).map((c) => {
      const base = slugify(c.label) || "col";
      let key = base; let n = 2;
      while (seen.has(key)) key = `${base}_${n++}`;
      seen.add(key);
      return { key, label: c.label.trim(), type: c.type };
    });
    run(() => createDatasetAction({ name: name.trim(), columns }), onCreated);
  };

  return (
    <ModalShell title="New table" subtitle="Define a table from scratch" onClose={onClose}
      footer={(
        <>
          <span />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {error && <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{error}</span>}
            <Hov onClick={pending ? undefined : create} base={primaryBtn(pending)} hover={{ background: C.accentPress }}>{pending ? "Creating…" : "Create table"}</Hov>
          </div>
        </>
      )}
    >
      <div style={{ marginBottom: 18 }}>
        <div className="dm-mono" style={fieldLabel}>Table name</div>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clients" style={fieldInput} />
      </div>
      <div className="dm-mono" style={fieldLabel}>Columns</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cols.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="text" value={c.label} onChange={(e) => update(i, { label: e.target.value })} placeholder={`Column ${i + 1}`} style={{ ...fieldInput, flex: 1 }} />
            <select value={c.type} onChange={(e) => update(i, { type: e.target.value })} style={{ ...fieldInput, width: 120, flex: "0 0 120px" }}>
              {COLUMN_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
            <button type="button" onClick={() => setCols((cs) => cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs)} title="Remove column" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: "1px solid #E1D9C8", background: "#fff", color: "#8A8477", cursor: "pointer", fontSize: 15 }}>×</button>
          </div>
        ))}
      </div>
      <Hov onClick={() => setCols((cs) => [...cs, { label: "", type: "text" }])} base={{ ...ghostBtn, marginTop: 10 }} hover={{ background: "#FBF8F1" }}>+ Add column</Hov>
    </ModalShell>
  );
}

function TableCell({ row, col, onSave }: { row: DatasetRowRecord; col: DatasetColumn; onSave: (data: Record<string, unknown>) => void }) {
  const initial = row.data?.[col.key];
  const [val, setVal] = useState(initial === null || initial === undefined ? "" : String(initial));
  const commit = () => {
    const next = coerceByType(col.type, val);
    if (JSON.stringify(next) !== JSON.stringify(initial ?? null)) onSave({ ...row.data, [col.key]: next });
  };
  const type = col.type === "number" ? "number" : col.type === "date" ? "date" : "text";
  return (
    <input
      type={type}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width: "100%", boxSizing: "border-box", border: "none", background: "transparent", fontFamily: "inherit", fontSize: 13, color: "#3A352C", padding: "9px 10px", outline: "none" }}
    />
  );
}


// --- Version diffing: compare two snapshots by their first-column identity. ---
function rowIdentity(data: Record<string, unknown>, keyCol: string | undefined): string | null {
  const v = keyCol ? data?.[keyCol] : undefined;
  return v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().toLowerCase();
}
type SnapDiff = { added: Set<number>; changed: Set<number>; removed: number };
function diffSnapshots(
  prev: { data: Record<string, unknown> }[],
  cur: { data: Record<string, unknown> }[],
  keyCol: string | undefined,
): SnapDiff {
  const prevByKey = new Map<string, string>();
  const prevJson = new Set<string>();
  for (const r of prev) {
    const j = JSON.stringify(r.data);
    prevJson.add(j);
    const k = rowIdentity(r.data, keyCol);
    if (k) prevByKey.set(k, j);
  }
  const curJson = new Set<string>();
  const curKeys = new Set<string>();
  const added = new Set<number>();
  const changed = new Set<number>();
  cur.forEach((r, idx) => {
    const j = JSON.stringify(r.data);
    curJson.add(j);
    const k = rowIdentity(r.data, keyCol);
    if (k) {
      curKeys.add(k);
      if (!prevByKey.has(k)) added.add(idx);
      else if (prevByKey.get(k) !== j) changed.add(idx);
    } else if (!prevJson.has(j)) {
      added.add(idx);
    }
  });
  let removed = 0;
  for (const r of prev) {
    const k = rowIdentity(r.data, keyCol);
    if (k) { if (!curKeys.has(k)) removed++; }
    else if (!curJson.has(JSON.stringify(r.data))) removed++;
  }
  return { added, changed, removed };
}

/** Rich version-history panel: a timeline with per-version change counts, an
 *  inline preview of what the table looked like, and one-click restore. */
function HistoryPanel({ datasetId, onRestore, pending }: { datasetId: string; onRestore: (id: string) => void; pending: boolean }) {
  const [snaps, setSnaps] = useState<SnapshotFull[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getSnapshotsAction(datasetId).then((r) => {
      if (!live) return;
      if (r.ok) setSnaps(r.snapshots); else setErr(r.error);
    });
    return () => { live = false; };
  }, [datasetId]);

  return (
    <div style={{ marginBottom: 14, border: "1px solid #E7E0D2", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
      <div className="dm-mono" style={{ ...monoLabel, padding: "10px 14px", borderBottom: "1px solid #F1EDE4", margin: 0 }}>Version history — preview, compare & rewind</div>
      {err && <div className="dm-mono" style={{ fontSize: 12, color: C.accent, padding: "14px" }}>{err}</div>}
      {!snaps && !err && <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "14px" }}>Loading history…</div>}
      {snaps && snaps.length === 0 && <div className="dm-mono" style={{ fontSize: 12, color: "#A39B8B", padding: "14px" }}>No versions yet. Every change you or an agent makes is saved here.</div>}
      {snaps && snaps.length > 0 && (
        <div style={{ maxHeight: 340, overflow: "auto" }}>
          {snaps.map((s, i) => {
            const you = s.actor === "You";
            const prev = snaps[i + 1];                       // the older version
            const keyCol = s.columns[0]?.key;
            const d = prev ? diffSnapshots(prev.rows, s.rows, keyCol) : null;
            const isOpen = openId === s.id;
            const dot = you ? C.ink : C.accent;
            return (
              <div key={s.id} style={{ borderTop: i === 0 ? "none" : "1px solid #F5F1E8" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px" }}>
                  {/* timeline rail */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch", flexShrink: 0 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: dot, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{you ? "Y" : s.actor.charAt(0).toUpperCase()}</span>
                    {i !== snaps.length - 1 && <span style={{ flex: 1, width: 2, background: "#EDE7DA", marginTop: 2 }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "#3A352C", fontWeight: 500 }}>{s.summary}</span>
                      {i === 0 && <span className="dm-mono" style={{ fontSize: 9.5, color: C.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</span>}
                    </div>
                    <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 2 }}>{you ? "You" : s.actor} · {relTime(s.createdAt)} · {s.rows.length} {s.rows.length === 1 ? "row" : "rows"}</div>
                    {d && (d.added.size || d.changed.size || d.removed) ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {d.added.size > 0 && <DiffBadge color={C.green} bg="#EAF4EC" text={`+${d.added.size} added`} />}
                        {d.changed.size > 0 && <DiffBadge color={C.gold} bg="#F6F0E0" text={`${d.changed.size} changed`} />}
                        {d.removed > 0 && <DiffBadge color={C.accent} bg="#FBE9E3" text={`−${d.removed} removed`} />}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Hov onClick={() => setOpenId(isOpen ? null : s.id)} base={{ ...ghostBtn, padding: "4px 10px", fontSize: 11.5 }} hover={{ background: "#FBF8F1" }}>{isOpen ? "Hide" : "Preview"}</Hov>
                      {i !== 0 && <Hov onClick={pending ? undefined : () => { if (confirm("Rewind the table to this version? Your current rows are saved to history first.")) onRestore(s.id); }} base={{ ...ghostBtn, padding: "4px 10px", fontSize: 11.5 }} hover={{ background: "#FBF8F1" }}>Restore</Hov>}
                    </div>
                    {isOpen && <SnapshotPreview snap={s} diff={d} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/** Inline table showing exactly what a version contained; rows that were added
 *  or changed since the previous version are tinted so the diff is visible. */
function SnapshotPreview({ snap, diff }: { snap: SnapshotFull; diff: SnapDiff | null }) {
  const cols = snap.columns;
  if (cols.length === 0) return <div className="dm-mono" style={{ fontSize: 11.5, color: "#A39B8B", marginTop: 8 }}>No columns in this version.</div>;
  const cellBorder = "1px solid #F1EDE4";
  return (
    <div style={{ marginTop: 10, border: "1px solid #EFE9DC", borderRadius: 9, overflow: "auto", maxHeight: 220 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#FAF6EE" }}>
            {cols.map((c) => <th key={c.key} style={{ textAlign: "left", padding: "6px 9px", borderRight: cellBorder, borderBottom: cellBorder, color: "#7A7367", fontWeight: 600, whiteSpace: "nowrap" }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {snap.rows.length === 0 && <tr><td colSpan={cols.length} className="dm-mono" style={{ padding: "10px", color: "#A39B8B", textAlign: "center" }}>Empty in this version.</td></tr>}
          {snap.rows.map((r, idx) => {
            const added = diff?.added.has(idx);
            const changed = diff?.changed.has(idx);
            const bg = added ? "#EAF4EC" : changed ? "#F9F4E7" : idx % 2 ? "#FCFAF4" : "#fff";
            return (
              <tr key={idx} style={{ background: bg }}>
                {cols.map((c) => (
                  <td key={c.key} style={{ padding: "6px 9px", borderRight: cellBorder, borderTop: cellBorder, color: "#3A352C", whiteSpace: "nowrap" }}>{showVal(r.data?.[c.key])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Group pending proposals into reviewable chunks — everything produced in one
// run (one email parsed, one sheet sync) shares a batch and is accepted/rejected
// together. Proposals without a batch (older ones) stand alone.
function chunkProposals(proposals: Proposal[]): ChangeChunk[] {
  const order: string[] = [];
  const byKey = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const key = p.batchId ?? `solo-${p.id}`;
    if (!byKey.has(key)) { byKey.set(key, []); order.push(key); }
    byKey.get(key)!.push(p);
  }
  return order.map((key) => {
    const ps = byKey.get(key)!;
    return {
      batchId: ps[0].batchId ?? key,
      proposedBy: ps[0].proposedBy,
      createdAt: ps.reduce((min, p) => (p.createdAt < min ? p.createdAt : min), ps[0].createdAt),
      sourceLabel: ps.find((p) => p.sourceLabel)?.sourceLabel ?? null,
      proposals: ps,
      adds: ps.filter((p) => p.kind === "add").length,
      updates: ps.filter((p) => p.kind === "update").length,
      conflicts: ps.filter((p) => p.conflict).length,
    };
  });
}

/** One reviewable chunk: a header describing the batch (who / from what / how
 *  many changes) with Accept-all / Reject-all, and the individual changes below. */
function ChangeChunkCard({ chunk, columns, onAcceptAll, onRejectAll, onAcceptOne, onRejectOne, pending }: {
  chunk: ChangeChunk;
  columns: DatasetColumn[];
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAcceptOne: (id: string) => void;
  onRejectOne: (id: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(chunk.conflicts > 0); // auto-expand conflicts
  const parts: string[] = [];
  if (chunk.adds) parts.push(`${chunk.adds} new ${chunk.adds === 1 ? "row" : "rows"}`);
  if (chunk.updates) parts.push(`${chunk.updates} ${chunk.updates === 1 ? "update" : "updates"}`);
  const from = chunk.sourceLabel ? `from “${chunk.sourceLabel}”` : "";
  return (
    <div style={{ border: `1px solid ${chunk.conflicts ? "#F3D6CB" : "#E7E0D2"}`, borderRadius: 13, background: chunk.conflicts ? "#FDF4F0" : "#FBF8F1", padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{chunk.proposedBy.charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600 }}>{chunk.proposedBy} <span style={{ fontWeight: 400, color: "#6B655B" }}>{from}</span></div>
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 1 }}>{parts.join(" · ") || "no changes"} · {relTime(chunk.createdAt)}{chunk.conflicts ? ` · ${chunk.conflicts} conflict${chunk.conflicts === 1 ? "" : "s"}` : ""}</div>
        </div>
        {chunk.conflicts > 0 && <span className="dm-mono" style={{ fontSize: 10, color: "#fff", background: C.accent, borderRadius: 999, padding: "2px 8px" }}>needs a decision</span>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 11, alignItems: "center", flexWrap: "wrap" }}>
        <Hov onClick={pending ? undefined : onAcceptAll} base={{ background: C.accent, color: "#fff8f4", border: "none", borderRadius: 9, padding: "7px 15px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }} hover={{ background: C.accentPress }}>Accept all</Hov>
        <Hov onClick={pending ? undefined : onRejectAll} base={ghostBtn} hover={{ background: "#FBF8F1" }}>Reject all</Hov>
        <Hov onClick={() => setOpen((v) => !v)} base={{ ...ghostBtn, marginLeft: "auto", border: "none", background: "none", color: "#8A8477" }} hover={{ color: C.ink }}>{open ? "Hide changes" : `Review ${chunk.proposals.length} ${chunk.proposals.length === 1 ? "change" : "changes"}`}</Hov>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {chunk.proposals.map((p) => (
            <ProposalCard key={p.id} p={p} columns={columns} pending={pending}
              onAccept={() => onAcceptOne(p.id)} onReject={() => onRejectOne(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({ p, columns, onAccept, onReject, pending }: { p: Proposal; columns: DatasetColumn[]; onAccept: () => void; onReject: () => void; pending: boolean }) {
  const label = showVal((p.currentData ?? p.data)[columns[0]?.key ?? ""]);
  const changed = p.kind === "update" && p.currentData
    ? columns.filter((c) => JSON.stringify(p.data[c.key] ?? null) !== JSON.stringify(p.currentData?.[c.key] ?? null))
    : columns;
  return (
    <div style={{ border: `1px solid ${p.conflict ? "#F3D6CB" : "#E7E0D2"}`, borderRadius: 12, background: p.conflict ? "#FDF4F0" : "#fff", padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{p.proposedBy.charAt(0).toUpperCase()}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
          {p.kind === "add" ? `${p.proposedBy} wants to add a row` : `${p.proposedBy} wants to update “${label}”`}
        </span>
        {p.conflict && <span className="dm-mono" style={{ fontSize: 10, color: "#fff", background: C.accent, borderRadius: 999, padding: "1px 7px" }}>you edited this</span>}
      </div>
      {p.conflict && <div style={{ fontSize: 12, color: "#8f5a3c", marginBottom: 8 }}>You changed this row by hand. {p.proposedBy} has different values — pick which to keep.</div>}
      <div style={{ display: "grid", gridTemplateColumns: p.kind === "update" && p.currentData ? "1fr 1fr 1fr" : "1fr 2fr", gap: 4, fontSize: 12, marginBottom: 10 }}>
        {p.kind === "update" && p.currentData && <><span /><span className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B", textTransform: "uppercase" }}>Yours</span><span className="dm-mono" style={{ fontSize: 9.5, color: C.accent, textTransform: "uppercase" }}>{p.proposedBy}</span></>}
        {changed.map((c) => (
          <Fragment key={c.key}>
            <span style={{ color: "#8A8477" }}>{c.label}</span>
            {p.kind === "update" && p.currentData && <span style={{ color: "#B44536", textDecoration: "line-through" }}>{showVal(p.currentData[c.key])}</span>}
            <span style={{ color: p.conflict ? C.accent : C.green, fontWeight: 600 }}>{showVal(p.data[c.key])}</span>
          </Fragment>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Hov onClick={pending ? undefined : onAccept} base={{ background: C.accent, color: "#fff8f4", border: "none", borderRadius: 9, padding: "7px 14px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }} hover={{ background: C.accentPress }}>
          {p.kind === "add" ? "Add row" : p.conflict ? `Use ${p.proposedBy}’s` : "Apply"}
        </Hov>
        <Hov onClick={pending ? undefined : onReject} base={ghostBtn} hover={{ background: "#FBF8F1" }}>{p.conflict ? "Keep mine" : "Ignore"}</Hov>
      </div>
    </div>
  );
}

function TableDetailModal({ table, onClose, onChanged }: { table: DatasetView; onClose: () => void; onChanged: () => void }) {
  const { pending, error, run } = useAction();
  const [addingCol, setAddingCol] = useState(false);
  const [colLabel, setColLabel] = useState("");
  const [colType, setColType] = useState("text");
  const [colDefault, setColDefault] = useState("");
  // Tables are edited + synced here; review happens at the FACT level (Review tab).
  const [panel, setPanel] = useState<"none" | "history">("none");
  const cols = table.columns;

  // Version selector: "latest" (live, editable) or a past snapshot (read-only).
  const [snaps, setSnaps] = useState<SnapshotFull[] | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getSnapshotsAction(table.id).then((r) => { if (alive && r.ok) setSnaps(r.snapshots); });
    return () => { alive = false; };
  }, [table.id]);
  const viewingPast = versionId !== null;
  const pastSnap = viewingPast ? snaps?.find((s) => s.id === versionId) ?? null : null;

  // Rows load lazily (the dashboard no longer ships them). `rows === null` = still
  // loading. `refresh` reloads the rows locally AND asks the page to revalidate.
  const [rows, setRows] = useState<DatasetRowRecord[] | null>(null);
  const [total, setTotal] = useState(table.rowCount);
  const reloadRows = () => getDatasetRowsAction(table.id).then((r) => { if (r.ok) { setRows(r.rows); setTotal(r.total); } });
  useEffect(() => {
    let alive = true;
    setRows(null);
    getDatasetRowsAction(table.id).then((r) => { if (alive && r.ok) { setRows(r.rows); setTotal(r.total); } });
    return () => { alive = false; };
  }, [table.id]);
  const refresh = () => { void reloadRows(); onChanged(); };

  const addRow = () => run(() => addRowAction(table.id, Object.fromEntries(cols.map((c) => [c.key, null]))), refresh);
  const submitCol = () => run(
    () => addColumnAction(table.id, { label: colLabel, type: colType, defaultValue: coerceByType(colType, colDefault) }),
    () => { setAddingCol(false); setColLabel(""); setColDefault(""); setColType("text"); refresh(); },
  );
  const removeCol = (key: string, label: string) => { if (confirm(`Remove column “${label}”? Its values are deleted from every row.`)) run(() => removeColumnAction(table.id, key), refresh); };
  const delRow = (id: string) => run(() => deleteRowAction(table.id, id), refresh);
  const delTable = () => { if (confirm(`Delete table “${table.name}” and all ${total} rows?`)) run(() => deleteDatasetAction(table.id), () => { onClose(); onChanged(); }); };
  const rename = () => { const n = prompt("Rename table", table.name); if (n && n.trim() && n.trim() !== table.name) run(() => renameDatasetAction(table.id, n.trim()), onChanged); };

  const rowSep = "1px solid #F3EEE3";

  // --- Grid state via TanStack Table (headless): it owns sorting/row model,
  //     we keep our own markup, inline styling, editable cells, humanEdited
  //     flag, and Server-Action save path. ---
  const [sorting, setSorting] = useState<SortingState>([]);
  const gridColumns: ColumnDef<DatasetRowRecord>[] = [
    {
      id: "__flag",
      enableSorting: false,
      header: () => null,
      cell: ({ row }) =>
        row.original.humanEdited ? (
          <span title="You edited this row — agents can’t overwrite it" style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.ink }} />
        ) : null,
    },
    ...cols.map<ColumnDef<DatasetRowRecord>>((c) => ({
      id: c.key,
      accessorFn: (r) => r.data?.[c.key],
      enableSorting: true,
      sortUndefined: "last",
      header: ({ column }) => {
        const dir = column.getIsSorted();
        return (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <button type="button" onClick={column.getToggleSortingHandler()} title="Sort by this column" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#3A352C", whiteSpace: "nowrap" }}>{c.label}</span>
                <span className="dm-mono" style={{ fontSize: 9, color: dir ? C.accent : "#C9C1B0" }}>{dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}</span>
              </button>
              <button type="button" onClick={() => removeCol(c.key, c.label)} title="Remove column" style={{ border: "none", background: "none", color: "#B7AF9F", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
            <span className="dm-mono" style={{ fontSize: 9.5, color: "#A39B8B", textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.type}</span>
          </>
        );
      },
      cell: ({ row }) => (
        <TableCell row={row.original} col={c} onSave={(data) => run(() => updateRowAction(table.id, row.original.id, data), refresh)} />
      ),
    })),
    {
      id: "__actions",
      enableSorting: false,
      header: () => null,
      cell: ({ row }) => (
        <button type="button" onClick={() => delRow(row.original.id)} title="Delete row" style={{ border: "none", background: "none", color: "#B7AF9F", cursor: "pointer", fontSize: 14, padding: "6px 8px" }}>🗑</button>
      ),
    },
  ];
  const grid = useReactTable({
    data: rows ?? [],
    columns: gridColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <ModalShell maxWidth={920} onClose={onClose}
      badge={{ initial: table.name.slice(0, 1).toUpperCase() || "T", bg: pickColor(table.name) }}
      title={table.name}
      subtitle={`${total} ${total === 1 ? "row" : "rows"} · ${cols.length} ${cols.length === 1 ? "column" : "columns"}${table.agentName ? ` · fed by ${table.agentName}` : ""}`}
      footer={(
        <>
          <Hov onClick={delTable} base={{ background: "none", border: "none", color: "#B44536", fontFamily: "inherit", fontSize: 13.5, fontWeight: 500, cursor: "pointer", padding: "8px 4px" }} hover={{ color: "#8f2f23" }}>Delete table</Hov>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {error && <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{error}</span>}
            {pending && <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B" }}>Saving…</span>}
            <Hov tag="a" href={`/api/datasets/${table.id}/export`} base={{ ...ghostBtn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }} hover={{ background: "#FBF8F1" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E8E4E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 9v12" /></svg>
              Export Excel
            </Hov>
          </div>
        </>
      )}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {/* Version selector — defaults to the latest (live) rows. */}
        <select value={versionId ?? "latest"} onChange={(e) => setVersionId(e.target.value === "latest" ? null : e.target.value)}
          title="View a saved version" style={{ ...ghostBtn, cursor: "pointer", paddingRight: 8 }}>
          <option value="latest">🕑 Latest (live)</option>
          {(snaps ?? []).map((s) => <option key={s.id} value={s.id}>{s.summary} · {relTime(s.createdAt)}</option>)}
        </select>
        {!viewingPast && <>
          <Hov onClick={addRow} base={ghostBtn} hover={{ background: "#FBF8F1" }}>+ Add row</Hov>
          <Hov onClick={() => setAddingCol((v) => !v)} base={ghostBtn} hover={{ background: "#FBF8F1" }}>+ Add column</Hov>
          <Hov onClick={rename} base={ghostBtn} hover={{ background: "#FBF8F1" }}>Rename</Hov>
        </>}
        <Hov onClick={() => setPanel((p) => p === "history" ? "none" : "history")} base={panel === "history" ? { ...ghostBtn, background: "#EFE9DC" } : ghostBtn} hover={{ background: "#FBF8F1" }}>History ({table.history.length})</Hov>
        {!viewingPast && (
          <ImportSheetButton
            datasetId={table.id}
            label="⇅ Sync a sheet"
            style={{ ...ghostBtn, marginLeft: "auto" }}
            hoverStyle={{ background: "#FBF8F1" }}
            onDone={() => { setPanel("none"); onChanged(); }}
          />
        )}
      </div>

      {!viewingPast && panel === "history" && <HistoryPanel datasetId={table.id} onRestore={(id) => run(() => restoreSnapshotAction(id), () => { setPanel("none"); refresh(); })} pending={pending} />}

      {addingCol && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: "12px", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11 }}>
          <input type="text" value={colLabel} onChange={(e) => setColLabel(e.target.value)} placeholder="Column name" style={{ ...fieldInput, flex: "1 1 140px", width: "auto" }} />
          <select value={colType} onChange={(e) => setColType(e.target.value)} style={{ ...fieldInput, width: 120, flex: "0 0 120px" }}>
            {COLUMN_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <input type="text" value={colDefault} onChange={(e) => setColDefault(e.target.value)} placeholder="Default (optional)" style={{ ...fieldInput, flex: "1 1 140px", width: "auto" }} />
          <Hov onClick={pending ? undefined : submitCol} base={primaryBtn(pending)} hover={{ background: C.accentPress }}>Add</Hov>
        </div>
      )}

      {viewingPast ? (
        pastSnap ? (
          <Panel label="Version" summary={`saved ${new Date(pastSnap.createdAt).toLocaleString()}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <span className="dm-mono" style={{ fontSize: 11, color: "#8f5a3c", background: "#FBEFD6", border: "1px solid #E6CF92", borderRadius: 8, padding: "3px 9px" }}>Read-only · saved version from {new Date(pastSnap.createdAt).toLocaleString()}</span>
              <Hov onClick={pending ? undefined : () => run(() => restoreSnapshotAction(pastSnap.id), () => { setVersionId(null); refresh(); })} base={ghostBtn} hover={{ background: "#FBF8F1" }}>Restore this version</Hov>
            </div>
            <SnapshotPreview snap={pastSnap} diff={null} />
          </Panel>
        ) : (
          <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "20px 0" }}>Loading version…</div>
        )
      ) : cols.length === 0 ? (
        <Panel label="Rows" summary="No columns yet">
          <div className="dm-mono" style={{ fontSize: 12.5, color: "#A39B8B", padding: "20px 14px" }}>Add a column above to start.</div>
        </Panel>
      ) : (
        <Panel
          label="Rows"
          summary={table.agentName ? `fed by ${table.agentName}` : `${cols.length} ${cols.length === 1 ? "column" : "columns"}`}
          summaryColor={table.agentName ? C.green : "#A39B8B"}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: cols.length * 140 + 68 }}>
              <thead>
                {grid.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} style={{ background: "#FBFAF7" }}>
                    {hg.headers.map((h) => {
                      const meta = h.column.id === "__flag" ? { width: 24 } : h.column.id === "__actions" ? { width: 40 } : null;
                      return (
                        <th key={h.id} style={{ textAlign: "left", padding: meta ? 0 : "9px 12px", borderBottom: rowSep, width: meta?.width, minWidth: meta ? undefined : 140, verticalAlign: "top" }}>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {grid.getRowModel().rows.map((r, ri) => (
                  <tr key={r.id} style={{ borderTop: rowSep, background: ri % 2 ? "#FCFBF8" : "#fff" }}>
                    {r.getVisibleCells().map((cell) => (
                      <td key={cell.id} style={cell.column.id.startsWith("__") ? { textAlign: "center" } : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {rows === null && (
                  <tr><td colSpan={cols.length + 2} className="dm-mono" style={{ padding: "18px 12px", fontSize: 12.5, color: "#A39B8B", textAlign: "center" }}>Loading rows…</td></tr>
                )}
                {rows !== null && rows.length === 0 && (
                  <tr><td colSpan={cols.length + 2} className="dm-mono" style={{ padding: "18px 12px", fontSize: 12.5, color: "#A39B8B", textAlign: "center" }}>No rows yet — “Add row” to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </ModalShell>
  );
}

/* ================================================================== */
/* SETTINGS: compute provider + plan                                  */
/* ================================================================== */
function SettingsModal({ settings, onClose, onSaved }: { settings: UserSettings; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<ComputeMode>(settings.computeMode);
  const [provider, setProvider] = useState(settings.aiProvider);
  const [key, setKey] = useState("");
  const { pending, error, run } = useAction();
  const [billing, startBilling] = useTransition();
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const limits = planLimits(settings.plan);
  const cloudLocked = !limits.cloudCompute;

  const save = () => run(
    () => updateComputeSettingsAction({ computeMode: mode, aiProvider: provider, byokKey: key ? key : undefined }),
    onSaved,
  );

  const upgrade = (planKey: string) => {
    setBillingMsg(null);
    startBilling(async () => {
      try {
        const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: planKey }) });
        if (res.ok) {
          const body = await res.json();
          if (body.url) { window.location.href = body.url; return; }
        }
        const body = await res.json().catch(() => ({}));
        setBillingMsg(body.error ?? "Billing isn’t available yet — add your Stripe keys to enable upgrades.");
      } catch {
        setBillingMsg("Couldn’t reach billing.");
      }
    });
  };

  const upgradeTargets = PLAN_ORDER.filter((p) => PLANS[p].priceMonthly > PLANS[settings.plan].priceMonthly);

  return (
    <ModalShell title="Settings" subtitle="Plan & how your data is analysed" onClose={onClose} maxWidth={640}
      footer={(
        <>
          <span />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {error && <span className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{error}</span>}
            <Hov onClick={pending ? undefined : save} base={primaryBtn(pending)} hover={{ background: C.accentPress }}>{pending ? "Saving…" : "Save settings"}</Hov>
          </div>
        </>
      )}
    >
      {/* Plan */}
      <div style={{ border: "1px solid #E7E0D2", borderRadius: 12, background: "#fff", padding: "14px 16px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{limits.label} plan</div>
            <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginTop: 2 }}>
              {limits.maxAgents === null ? "Unlimited agents" : `${limits.maxAgents} agents`} · {limits.autoMode ? "auto mode" : "on-ping only"} · {limits.cloudCompute ? "cloud or BYOK" : "BYOK only"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {upgradeTargets.map((p) => (
              <Hov key={p} onClick={billing ? undefined : () => upgrade(p)} base={{ background: C.accent, color: "#fff8f4", border: "none", borderRadius: 9, padding: "8px 14px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }} hover={{ background: C.accentPress }}>
                {billing ? "…" : `Upgrade to ${PLANS[p].label} · $${PLANS[p].priceMonthly}/mo`}
              </Hov>
            ))}
          </div>
        </div>
        {billingMsg && <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginTop: 10 }}>{billingMsg}</div>}
      </div>

      {/* Compute mode */}
      <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 10 }}>How should your data be analysed?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button type="button" disabled={cloudLocked} onClick={() => !cloudLocked && setMode("cloud")} style={{ ...modeCard(mode === "cloud"), opacity: cloudLocked ? 0.55 : 1, cursor: cloudLocked ? "not-allowed" : "pointer" }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Datamodo cloud {cloudLocked && <span className="dm-mono" style={{ fontSize: 10, color: C.accent, marginLeft: 6 }}>Pro</span>}</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>We run the models for you. {cloudLocked ? "Upgrade to enable." : "Nothing to configure."}</div>
          </div>
          <span style={radioDot(mode === "cloud")} />
        </button>
        <button type="button" onClick={() => setMode("byok")} style={modeCard(mode === "byok")}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Bring your own key</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Analyse with your own Claude or OpenAI API key — you pay the provider directly.</div>
          </div>
          <span style={radioDot(mode === "byok")} />
        </button>
      </div>

      {mode === "byok" && (
        <div style={{ marginTop: 14, padding: "14px", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11 }}>
          <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 8 }}>Provider</div>
          <Segmented value={provider} onChange={setProvider} options={[{ v: "anthropic", label: "Claude" }, { v: "openai", label: "OpenAI" }, { v: "openrouter", label: "OpenRouter" }]} />
          <div className="dm-mono" style={{ ...fieldLabel, margin: "14px 0 8px" }}>API key</div>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.byokKeySet ? "•••••••• (saved — paste to replace)" : provider === "openai" ? "sk-…" : provider === "openrouter" ? "sk-or-…" : "sk-ant-…"} style={fieldInput} />
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 8, lineHeight: 1.5 }}>
            This is an <b>API key</b> (billed per use), not your ChatGPT Plus / Claude Pro subscription — those don’t grant API access. Get one from {provider === "openai" ? "platform.openai.com" : provider === "openrouter" ? "openrouter.ai/keys" : "console.anthropic.com"}. OpenRouter gives you one key across many models. Signing in to authorise your account is on the roadmap.
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* ================================================================== */
/* DATA — relationship graph between tables (explicit FK-like links).   */
/* ================================================================== */
function RelationshipGraph({ tables, relations, datasets, onOpen, onChanged }: {
  tables: TableInfo[];
  relations: DatasetRelation[];
  datasets: DatasetView[];
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const { pending, error, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [fromDs, setFromDs] = useState("");
  const [fromCol, setFromCol] = useState("");
  const [toDs, setToDs] = useState("");
  const [toCol, setToCol] = useState("");
  const [label, setLabel] = useState("");

  // Auto-link suggestions: table pairs that share values but aren't linked yet.
  const [suggestions, setSuggestions] = useState<RelationSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const sugKey = (s: RelationSuggestion) => `${s.fromDatasetId}:${s.fromColumn}|${s.toDatasetId}:${s.toColumn}`;
  const loadSuggestions = () => {
    void fetch("/api/relations/suggestions").then((r) => r.json()).then((j) => setSuggestions(j.suggestions ?? [])).catch(() => {});
  };
  useEffect(loadSuggestions, [relations.length]);
  const shownSuggestions = suggestions.filter((s) => !dismissed.has(sugKey(s)));

  // Deterministic circular layout so the graph is stable across renders.
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    const n = tables.length;
    tables.forEach((t, i) => {
      if (n === 1) { m.set(t.id, { x: 50, y: 50 }); return; }
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      m.set(t.id, { x: 50 + Math.cos(a) * 38, y: 50 + Math.sin(a) * 33 });
    });
    return m;
  }, [tables]);

  const colsOf = (id: string) => datasets.find((d) => d.id === id)?.columns ?? [];
  const edges = relations.filter((r) => pos.has(r.fromDatasetId) && pos.has(r.toDatasetId));

  const submit = () => run(
    () => createRelationAction({ fromDatasetId: fromDs, fromColumn: fromCol, toDatasetId: toDs, toColumn: toCol, label: label || null }),
    () => { setAdding(false); setFromDs(""); setFromCol(""); setToDs(""); setToCol(""); setLabel(""); onChanged(); },
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 16, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <span className="dm-display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: C.ink }}>How your tables connect</span>
          <span className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginLeft: 10 }}>{edges.length} {edges.length === 1 ? "relationship" : "relationships"}</span>
        </div>
        <Hov onClick={() => setAdding((v) => !v)} base={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6 }} hover={{ background: "#FBF8F1" }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add relationship
        </Hov>
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: "12px", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11 }}>
          <select value={fromDs} onChange={(e) => { setFromDs(e.target.value); setFromCol(""); }} style={{ ...fieldInput, width: 150, flex: "0 0 150px" }}>
            <option value="">From table…</option>
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={fromCol} onChange={(e) => setFromCol(e.target.value)} disabled={!fromDs} style={{ ...fieldInput, width: 130, flex: "0 0 130px" }}>
            <option value="">column…</option>
            {colsOf(fromDs).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <span style={{ color: "#A39B8B", fontSize: 16 }}>→</span>
          <select value={toDs} onChange={(e) => { setToDs(e.target.value); setToCol(""); }} style={{ ...fieldInput, width: 150, flex: "0 0 150px" }}>
            <option value="">To table…</option>
            {datasets.filter((d) => d.id !== fromDs).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={toCol} onChange={(e) => setToCol(e.target.value)} disabled={!toDs} style={{ ...fieldInput, width: 130, flex: "0 0 130px" }}>
            <option value="">column…</option>
            {colsOf(toDs).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (optional)" style={{ ...fieldInput, flex: "1 1 120px", width: "auto" }} />
          <Hov onClick={pending || !fromDs || !fromCol || !toDs || !toCol ? undefined : submit} base={{ ...primaryBtn(pending || !fromDs || !fromCol || !toDs || !toCol), padding: "8px 16px", fontSize: 13, boxShadow: "none" }} hover={{ background: C.accentPress }}>Link</Hov>
          {error && <span className="dm-mono" style={{ fontSize: 11, color: C.accent, flexBasis: "100%" }}>{error}</span>}
        </div>
      )}

      {/* Auto-link suggestions */}
      {shownSuggestions.length > 0 && (
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: C.accent }}>✦</span> Suggested links · these tables share values
          </div>
          {shownSuggestions.map((s) => (
            <div key={sugKey(s)} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FDF9F2", border: "1px solid #EFE1D2", borderRadius: 11, padding: "9px 12px" }}>
              <span style={{ fontSize: 13, color: C.ink }}>
                <b style={{ fontWeight: 600 }}>{s.fromDatasetName}</b> <span className="dm-mono" style={{ fontSize: 11.5, color: "#8A8477" }}>{s.fromColumnLabel}</span>
                <span style={{ color: "#C9BCA6", margin: "0 7px" }}>→</span>
                <b style={{ fontWeight: 600 }}>{s.toDatasetName}</b> <span className="dm-mono" style={{ fontSize: 11.5, color: "#8A8477" }}>{s.toColumnLabel}</span>
              </span>
              <span style={{ fontSize: 11.5, color: "#8A8477" }}>shares {s.sample.slice(0, 2).join(", ")}{s.overlap > 2 ? ` +${s.overlap - 2}` : ""}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
                <Hov onClick={pending ? undefined : () => run(
                  () => createRelationAction({ fromDatasetId: s.fromDatasetId, fromColumn: s.fromColumn, toDatasetId: s.toDatasetId, toColumn: s.toColumn, label: null }),
                  () => { setDismissed((d) => new Set(d).add(sugKey(s))); onChanged(); loadSuggestions(); },
                )} base={{ ...primaryBtn(pending), padding: "6px 14px", fontSize: 12.5, boxShadow: "none" }} hover={{ background: C.accentPress }}>Link</Hov>
                <Hov onClick={() => setDismissed((d) => new Set(d).add(sugKey(s)))} base={{ ...ghostBtn, padding: "6px 11px", fontSize: 12.5 }} hover={{ background: "#FBF8F1" }}>Dismiss</Hov>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Graph */}
      <div style={{ position: "relative", height: 240, borderRadius: 12, background: "linear-gradient(#FCFAF4,#FBF8F1)", border: "1px solid #F1EDE4", overflow: "hidden" }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {edges.map((e) => {
            const a = pos.get(e.fromDatasetId)!;
            const b = pos.get(e.toDatasetId)!;
            return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#D8CFBD" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        {edges.map((e) => {
          const a = pos.get(e.fromDatasetId)!;
          const b = pos.get(e.toDatasetId)!;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const text = e.label || `${e.fromColumn} → ${e.toColumn}`;
          return (
            <span key={`l-${e.id}`} className="dm-mono" style={{ position: "absolute", left: `${mx}%`, top: `${my}%`, transform: "translate(-50%,-50%)", fontSize: 9.5, color: "#8A8477", background: "#FCFAF4", border: "1px solid #ECE5D8", borderRadius: 6, padding: "1px 6px", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              {text}
              <button type="button" title="Delete relationship" onClick={() => { if (confirm(`Delete relationship “${text}”?`)) run(() => deleteRelationAction(e.id), onChanged); }} style={{ border: "none", background: "none", color: "#C0B7A5", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          );
        })}
        {tables.map((t) => {
          const p = pos.get(t.id)!;
          return (
            <button key={t.id} type="button" onClick={() => onOpen(t.id)} title={`Open ${t.name}`}
              style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)", display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 999, padding: "7px 13px", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 6px 16px -10px rgba(33,30,24,.4)", whiteSpace: "nowrap" }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: t.agentBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{t.name.charAt(0).toUpperCase()}</span>
              <span className="dm-display" style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink }}>{t.name}</span>
            </button>
          );
        })}
        {edges.length === 0 && (
          <span className="dm-mono" style={{ position: "absolute", left: "50%", bottom: 12, transform: "translateX(-50%)", fontSize: 10.5, color: "#B7AF9F" }}>No relationships yet — “Add relationship” to link a column to another table.</span>
        )}
      </div>
    </div>
  );
}
