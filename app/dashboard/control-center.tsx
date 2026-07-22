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
import { signout } from "@/app/auth/actions";
import { QueuePill } from "./queue-pill";
import {
  createAgentAction,
  updateAgentAction,
  deleteAgentAction,
  createDatasetAction,
  updateComputeSettingsAction,
} from "./actions";
import type { AgentActivityEntry, AgentRecord, DatasetColumn, DatasetRelation, DatasetView, ReviewItem } from "@/lib/datamodo/types";
import type { UserSettings, OnboardingContext } from "@/lib/datamodo/settings";
import type { SearchResult, SearchHit, KnowledgeHit } from "@/lib/datamodo/search";
import type { GroundedAnswer } from "@/lib/datamodo/answer";
import type { ChunkHit } from "@/lib/datamodo/chunks";
import { PLANS, PLAN_ORDER, planLimits, type ComputeMode } from "@/lib/datamodo/plans";
import {
  Hov, C, LOGO, CH_NAMES, modeCard, radioDot, bar, toggleTrack, toggleKnob,
  channelTile, targetChip, monoLabel, fieldInput, fieldLabel, primaryBtn, ghostBtn,
  pickColor, relTime, slugify, COLUMN_TYPES, Segmented, ModalShell,
  useAction, type Agent, type TableInfo,
} from "./ui";
import { ImportSheetButton, TablePage } from "./table-page";
import { ReviewStudio } from "./review-studio";
import { ConnectionsModal } from "./connections";
import { OnboardingModal } from "./onboarding-modal";
import { ImportGraphModal } from "./import-graph-modal";
import { ObsidianImportModal } from "./obsidian-import-modal";
import { KnowledgeView } from "./knowledge-view";
import { InsightsView } from "./insights-view";
import { CommitLogView, TimelineView } from "./timeline-view";
import { FilesView } from "./files-view";
import { AnswerCard } from "./answer-card";
import { AnswerGraphModal } from "./answer-graph-modal";
import { CategoriesModal } from "./categories-modal";
import { BuildFromKnowledgeModal } from "./build-from-knowledge";
import { DeriveTableModal } from "./derive-table-modal";
import { ChatView } from "./chat-view";
import { CommandPalette, type Command } from "./command-palette";

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */
type Tab = "agents" | "data" | "review" | "search" | "chat";
// The Data tab is ONE FLAT toggle (IA rule 2026-07-11: no toggles inside
// toggles). Tables/Cards/Concepts unified into the Tables surface (schema
// diagram + cards drill-down); the Map was removed outright — walk only.
type DataView = "tables" | "explore" | "graph" | "files" | "insights";
/** Review = ALL change (user call 2026-07-14): pending decisions + the past —
 *  a git-style commit log and the story timeline (moved here from Data). */
type ReviewView = "pending" | "commits" | "timeline";
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
  /** Local edition: no auth — hide sign-out (there's nothing to sign out of). */
  local?: boolean;
};

export default function ControlCenter({ fullName, initial, inbox, agents, datasets, relations, pendingChanges, pendingReviewCount, agentActivity, settings, onboarding, notice, local }: ControlCenterProps) {
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
  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [contextDismissed, setContextDismissed] = useState(false);
  const onboardingTrack = Array.isArray(onboarding.answers?.track) ? (onboarding.answers.track as string[]) : [];
  const hasContext = !!onboarding.businessContext;
  const [buildOpen, setBuildOpen] = useState(false);
  const [deriveOpen, setDeriveOpen] = useState(false);
  const [dataView, setDataView] = useState<DataView>("tables");
  const [reviewView, setReviewView] = useState<ReviewView>("pending");
  const [dataActionsOpen, setDataActionsOpen] = useState(false);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [inboxCopied, setInboxCopied] = useState(false);

  // ⌘K / Ctrl-K opens the palette from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyInbox = () => {
    navigator.clipboard?.writeText(inbox).then(() => {
      setInboxCopied(true);
      setTimeout(() => setInboxCopied(false), 1600);
    }).catch(() => {});
  };

  // The rare build/import actions — ONE list feeding both the topbar
  // "Build ▾" menu and the command palette (simplicity rule: no peers).
  const buildActions: readonly (readonly [string, string, () => void])[] = [
    ["Categories", "Edit what kinds of things exist", () => setCategoriesOpen(true)],
    ["Spreadsheet → knowledge", "Import a sheet as entities & links", () => setImportGraphOpen(true)],
    ["Obsidian vault → knowledge", "Notes become pages, links become edges", () => setObsidianOpen(true)],
    ["Build from knowledge", "Turn a category into a table", () => setBuildOpen(true)],
    ["Derive a table", "Describe a table; we build it from your graph", () => setDeriveOpen(true)],
  ] as const;
  const manageAgent = agents.find((a) => a.id === manageAgentId) ?? null;
  const openTable = datasets.find((d) => d.id === openTableId) ?? null;

  // Open a table as its full-width PAGE (redesign 2026-07-20) from anywhere —
  // search hits, derive-table, "+ new table" — landing on Data › Tables.
  const openTablePage = (id: string) => {
    setOpenTableId(id);
    setTab("data");
    setDataView("tables");
  };
  // Hand a row's entity to the Explorer walk ("◍ Walk" in the side peek).
  const [exploreReq, setExploreReq] = useState<{ id: string; seed: number } | null>(null);
  const exploreEntity = (entityId: string) => {
    setExploreReq((p) => ({ id: entityId, seed: (p?.seed ?? 0) + 1 }));
    setTab("data");
    setDataView("explore");
  };

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
      try {
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
      } catch {
        // A rejected action (network drop, or a fresh deployment invalidating
        // this page's action ids) degrades to a message, never a crash screen.
        setCreateError("Something went wrong — reload the page and try again.");
      }
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
    data: { t: "Data", sub: {
      explore: "Everything we know, walkable — stand on a node and look around; scroll out for the big picture",
      graph: "Your whole vault as one map — every entity and link at once; pick the layout that reads best",
      files: "Documents that arrived as attachments — filed by what they mention, originals kept",
      insights: "The numbers behind your knowledge — totals & breakdowns, computed live",
      tables: "Your data as a database — every category is a table, connected like a schema; click one to browse its records",
    }[dataView] },
    review: { t: "Review", sub: {
      pending: reviewTotal ? `${reviewTotal} pending changes to confirm — merges, conflicts & new facts` : "Pending changes to confirm — merges, conflicts & new facts",
      commits: "Every extraction run as a commit — what each message added or changed, newest first",
      timeline: "What datamodo learned, in order — your data's story, not table edits",
    }[reviewView] },
    search: { t: "Search", sub: "Ask anything across everything your agents have captured" },
    chat: { t: "Chat", sub: "The app is a channel too — text, photos, PDFs and voice notes, straight into the pipeline" },
  };

  const providerLabel = settings.aiProvider === "openai" ? "OpenAI" : settings.aiProvider === "openrouter" ? "OpenRouter" : settings.aiProvider === "ollama" ? "Ollama" : "Claude";
  const ollama = settings.aiProvider === "ollama";
  // Local edition: the platform default ("cloud") IS this machine's Ollama.
  const runtimeLabel = cloud ? (local ? "Local AI — this machine" : "Datamodo cloud") : ollama ? "Your Ollama server" : `Your ${providerLabel} key`;
  const runtimeSub = cloud
    ? (local ? "Models run here via Ollama — private, free." : "We run every agent for you.")
    : settings.byokKeySet
    ? (ollama ? "Runs on your own Ollama server — keyless." : `Runs on your ${providerLabel} API key.`)
    : (ollama ? "Add your server URL to start." : "Add your API key to start.");
  const runtimeDot = cloud ? C.green : (settings.byokKeySet ? C.gold : C.accent);
  const plan = planLimits(settings.plan);

  return (
    <div className="cc-shell">
      {notice && noticeOpen && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 200, maxWidth: 620, width: "calc(100% - 24px)", display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", background: "#FBEFD6", border: "1px solid #E6CF92", borderRadius: 12, boxShadow: "0 12px 30px -12px rgba(33,30,24,.4)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A8043" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
          <span style={{ fontSize: 12.5, color: "#6B551F", lineHeight: 1.4, flex: 1 }}>{notice}</span>
          <button type="button" onClick={() => setNoticeOpen(false)} style={{ border: "none", background: "none", color: "#9A8043", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }} title="Dismiss">✕</button>
        </div>
      )}
      {/* ================= SIDEBAR ================= */}
      <aside className="cc-side">
        <div style={{ padding: "2px 8px 22px", display: "flex", alignItems: "baseline" }}>
          <span className="dm-script" style={{ fontWeight: 700, fontSize: 27, lineHeight: 1, color: "#F1ECE1", display: "inline-block", transform: "rotate(-2deg)", marginRight: 1 }}>data</span>
          <span className="dm-display" style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.03em", color: "#F1ECE1" }}>modo</span>
        </div>

        {/* New agent + workspace nav — a plain stack on desktop; on mobile
            this whole group becomes one horizontally-scrollable row so the
            action and the tabs stay aligned together. */}
        <div className="cc-navgroup">
        <Hov
          onClick={openModal}
          className="cc-new"
          base={{ display: "flex", alignItems: "center", gap: 10, background: "#2B2720", border: "1px solid rgba(241,236,225,.06)", borderRadius: 10, padding: "10px 12px", color: "#F1ECE1", fontFamily: "inherit", fontSize: 13, fontWeight: 500, marginBottom: 18, cursor: "pointer", width: "100%", textAlign: "left", transition: "background var(--dm-t-quick) var(--dm-ease)" }}
          hover={{ background: "#322D25" }}
        >
          <span style={{ width: 24, height: 24, borderRadius: 7, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, lineHeight: 1 }}>+</span>
          New agent
        </Hov>

        <nav className="cc-nav" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {([
            { key: "agents", label: "Agents", count: uiAgents.length ? String(uiAgents.length) : null, icon: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" /><path d="M9 14h.01M15 14h.01" /></> },
            { key: "data", label: "Data", count: uiTables.length ? String(uiTables.length) : null, icon: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 10h18M9 4v16" /></> },
            { key: "review", label: "Review", count: reviewTotal ? String(reviewTotal) : null, icon: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> },
            { key: "search", label: "Search", count: null, icon: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></> },
            { key: "chat", label: "Chat", count: null, icon: <><path d="M21 14a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></> },
          ] as const).map((item) => {
            const active = tab === item.key;
            return (
              <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`cc-nav-item${active ? " is-active" : ""}`}>
                <span className="cc-nav-ico">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
                  <span style={{ color: "inherit" }}>{item.label}</span>
                </span>
                {item.count && <span className="dm-mono" style={{ fontSize: 11, color: "#7C766B" }}>{item.count}</span>}
              </button>
            );
          })}
        </nav>
        </div>

        {reviewTotal > 0 && (
        <div className="cc-review cc-side-sec">
          <button type="button" onClick={() => { setTab("review"); setReviewView("pending"); }} className="cc-side-row">
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0, animation: "cc-pulse 2.6s ease-in-out infinite" }} />
              Needs review
            </span>
            <span className="dm-mono" style={{ fontSize: 11, color: "#fff", background: C.accent, borderRadius: 999, padding: "1px 8px", flexShrink: 0 }}>{reviewTotal}</span>
          </button>
        </div>
        )}

        {/* sources — where new data comes from (moved out of the topbar) */}
        <div className="cc-sources cc-side-sec" style={{ marginTop: "auto" }}>
          <p className="dm-mono cc-kicker">Sources</p>
          <button type="button" onClick={() => setConnectionsOpen(true)} className="cc-side-row">
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></svg>
              Connect a channel
            </span>
          </button>
          <button type="button" onClick={copyInbox} className="cc-side-row" title="Your forwarding address — click to copy">
            <span className="dm-mono" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inbox}</span>
            <span className="dm-mono" style={{ fontSize: 10.5, color: inboxCopied ? "#7fb391" : "#7C766B", flexShrink: 0 }}>{inboxCopied ? "copied" : "copy"}</span>
          </button>
        </div>

        {/* runtime / compute — a quiet row, not a boxed card */}
        <div className="cc-compute cc-side-sec">
          <button type="button" onClick={() => setSettingsOpen(true)} className="cc-side-row" title={runtimeSub}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: runtimeDot, flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{runtimeLabel}</span>
            </span>
            <span className="dm-mono" style={{ fontSize: 10.5, color: "#7C766B", flexShrink: 0 }}>manage</span>
          </button>
        </div>

        {/* user */}
        <div className="cc-user" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 8px 2px", borderTop: "1px solid var(--side-hairline)", marginTop: 12 }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{initial}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#F1ECE1", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</div>
            <button type="button" onClick={() => setSettingsOpen(true)} className="dm-mono" style={{ fontSize: 10.5, color: "#7C766B", background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" }}>{local ? "self-hosted" : `${plan.label} plan`}</button>
          </div>
          <form action={signout} style={{ marginLeft: "auto", flexShrink: 0, display: local ? "none" : undefined }}>
            <Hov tag="button" type="submit" title="Sign out" base={{ background: "none", border: "none", color: "#7C766B", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }} hover={{ color: "#F1ECE1" }}>
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
            <QueuePill />
            {tab === "data" && (
              <div style={{ position: "relative" }}>
                <button type="button" className="cc-chip" onClick={() => setDataActionsOpen((o) => !o)}>
                  <span style={{ color: C.accent }}>✦</span> Build <span style={{ fontSize: 10, color: "#A39B8B" }}>▾</span>
                </button>
                {dataActionsOpen && (
                  <div className="dm-drop" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, background: "#fff", border: "1px solid #E7E0D2", borderRadius: 12, boxShadow: "0 14px 34px rgba(33,30,24,.16)", overflow: "hidden", minWidth: 230 }}>
                    {buildActions.map(([label, hint, act]) => (
                      <button key={label} type="button" onClick={() => { setDataActionsOpen(false); act(); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <span style={{ display: "block", fontSize: 13, color: C.ink, fontWeight: 500 }}>{label}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#8A8477", marginTop: 1 }}>{hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="cc-chip" onClick={() => setCmdkOpen(true)} title="Jump anywhere — views, tables, actions">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
              <span className="cc-kbd">⌘K</span>
            </button>
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
                {/* Rare build/import actions live in the topbar's ONE "Build ▾"
                    menu (and the ⌘K palette) — the toggle row stays clean. */}
                <Segmented value={dataView} onChange={setDataView} options={[{ v: "tables", label: "Tables" }, { v: "explore", label: "Explore" }, { v: "graph", label: "Graph" }, { v: "files", label: "Files" }, { v: "insights", label: "Insights" }]} />
              </div>
              {/* A table opens IN PLACE of the Tables surface (Notion-grammar
                  redesign 2026-07-20): full-width page, not a modal. */}
              {dataView === "tables" && openTable && (
                <TablePage
                  table={openTable}
                  onClose={() => setOpenTableId(null)}
                  onChanged={() => router.refresh()}
                  onExplore={exploreEntity}
                  onReview={() => setTab("review")}
                />
              )}
              {/* ONE KnowledgeView instance across Tables/Explore/Graph — same
                  slot, so the walk's breadcrumb trail survives pill switches
                  (kept mounted but hidden while a table page is open). */}
              {(dataView === "tables" || dataView === "explore" || dataView === "graph") && (
                <div style={dataView === "tables" && openTable ? { display: "none" } : undefined}>
                  <KnowledgeView
                    view={dataView === "tables" ? "schema" : dataView}
                    onSwitch={() => setDataView("explore")}
                    tables={datasets.map((d) => ({ id: d.id, name: d.name, kindId: d.kind_id }))}
                    tableLinks={relations}
                    onOpenTable={setOpenTableId}
                    onTablesChanged={() => router.refresh()}
                    exploreRequest={exploreReq}
                  />
                </div>
              )}
              {dataView === "files" && <FilesView />}
              {dataView === "insights" && <InsightsView />}
              {dataView === "tables" && !openTable && (uiTables.length || createTableOpen ? (
                <div style={{ marginTop: 24 }}>
                  <DataFull tables={uiTables} onOpen={setOpenTableId} onCreate={() => setCreateTableOpen(true)} onImported={() => router.refresh()} selected={selectedTables} toggleSelect={(id) => setSelectedTables((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])} />
                </div>
              ) : <DataEmpty openModal={() => setCreateTableOpen(true)} />)}
            </>
          )}
          {tab === "review" && (
            <>
              {/* Review owns ALL change: what needs a decision AND what already
                  happened — one flat toggle (commit log + the story timeline,
                  moved here from Data per the 2026-07-14 call). */}
              <div style={{ marginBottom: 14 }}>
                <Segmented value={reviewView} onChange={setReviewView} options={[
                  { v: "pending", label: `Pending${reviewTotal ? ` · ${reviewTotal}` : ""}` },
                  { v: "commits", label: "Commits" },
                  { v: "timeline", label: "Timeline" },
                ]} />
              </div>
              {reviewView === "pending" && <ReviewStudio />}
              {reviewView === "commits" && <CommitLogView />}
              {reviewView === "timeline" && <TimelineView />}
            </>
          )}
          {tab === "search" && <SearchTab onOpenTable={openTablePage} />}
          {tab === "chat" && <ChatView />}
        </div>
      </main>

      {/* ================= ⌘K COMMAND PALETTE ================= */}
      {cmdkOpen && <CommandPalette
        onClose={() => setCmdkOpen(false)}
        commands={([
          { id: "go-agents", section: "Go to", label: "Agents", run: () => setTab("agents") },
          { id: "go-tables", section: "Go to", label: "Data · Tables", keywords: "schema categories", run: () => { setTab("data"); setDataView("tables"); } },
          { id: "go-explore", section: "Go to", label: "Data · Explore", keywords: "walk graph node", run: () => { setTab("data"); setDataView("explore"); } },
          { id: "go-graph", section: "Go to", label: "Data · Graph", keywords: "map whole vault", run: () => { setTab("data"); setDataView("graph"); } },
          { id: "go-files", section: "Go to", label: "Data · Files", keywords: "documents attachments", run: () => { setTab("data"); setDataView("files"); } },
          { id: "go-insights", section: "Go to", label: "Data · Insights", keywords: "numbers totals", run: () => { setTab("data"); setDataView("insights"); } },
          { id: "go-review", section: "Go to", label: "Review · Pending", hint: reviewTotal ? String(reviewTotal) : undefined, keywords: "changes approve", run: () => { setTab("review"); setReviewView("pending"); } },
          { id: "go-commits", section: "Go to", label: "Review · Commits", keywords: "history log", run: () => { setTab("review"); setReviewView("commits"); } },
          { id: "go-timeline", section: "Go to", label: "Review · Timeline", keywords: "story learned", run: () => { setTab("review"); setReviewView("timeline"); } },
          { id: "go-search", section: "Go to", label: "Search", keywords: "ask question", run: () => setTab("search") },
          { id: "go-chat", section: "Go to", label: "Chat", keywords: "message send", run: () => setTab("chat") },
          ...uiTables.map((t): Command => ({ id: `table-${t.id}`, section: "Tables", label: t.name, hint: t.rows, keywords: "open table", run: () => openTablePage(t.id) })),
          { id: "act-new-agent", section: "Actions", label: "New agent", run: openModal },
          { id: "act-connect", section: "Actions", label: "Connect a channel", keywords: "gmail whatsapp slack source", run: () => setConnectionsOpen(true) },
          { id: "act-context", section: "Actions", label: hasContext ? "Edit business context" : "Set business context", keywords: "onboarding about", run: () => setOnboardingOpen(true) },
          { id: "act-inbox", section: "Actions", label: "Copy inbox address", hint: inbox, keywords: "forward email", run: copyInbox },
          ...buildActions.map(([label, hint, act]): Command => ({ id: `build-${label}`, section: "Actions", label, hint: undefined, keywords: `build ${hint}`, run: act })),
          { id: "act-settings", section: "Actions", label: local ? "Settings" : "Settings & plan", keywords: "compute byok billing", run: () => setSettingsOpen(true) },
        ] as Command[])}
      />}

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
                <ModalStep4 name={name} setName={setName} channels={channels} mode={mode} purpose={purpose} freestyle={freestyle} targetTables={targetTables} runtimeDot={runtimeDot} runtimeLabel={runtimeLabel} />
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
      {createTableOpen && (
        <CreateTableModal
          onClose={() => setCreateTableOpen(false)}
          onCreated={(id) => {
            setCreateTableOpen(false);
            // "+ new table" lands you straight in the (empty) grid.
            if (id) openTablePage(id);
            router.refresh();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          local={local}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => { setSettingsOpen(false); router.refresh(); }}
        />
      )}
      {connectionsOpen && <ConnectionsModal inbox={inbox} onClose={() => setConnectionsOpen(false)} />}
      {onboardingOpen && <OnboardingModal initialContext={onboarding.businessContext} initialTrack={onboardingTrack} onClose={() => setOnboardingOpen(false)} onSaved={() => { setOnboardingOpen(false); router.refresh(); }} onImportSpreadsheet={() => { setOnboardingOpen(false); setImportGraphOpen(true); }} />}
      {importGraphOpen && <ImportGraphModal onClose={() => setImportGraphOpen(false)} onDone={() => router.refresh()} />}
      {obsidianOpen && <ObsidianImportModal onClose={() => setObsidianOpen(false)} onDone={() => router.refresh()} />}
      {categoriesOpen && <CategoriesModal onClose={() => setCategoriesOpen(false)} onChanged={() => router.refresh()} />}
      {buildOpen && (
        <BuildFromKnowledgeModal
          datasets={datasets.map((d) => ({ id: d.id, name: d.name, columns: d.columns }))}
          onClose={() => setBuildOpen(false)}
          onDone={() => router.refresh()}
        />
      )}
      {deriveOpen && (
        <DeriveTableModal
          onClose={() => setDeriveOpen(false)}
          onCreated={(id) => { openTablePage(id); router.refresh(); }}
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

type SearchResponse = SearchResult & { entities: KnowledgeHit[]; passages: ChunkHit[]; answer: GroundedAnswer | null };

/** A passage found INSIDE a document — the evidence layer, cited by page. */
function PassageCard({ p, terms }: { p: ChunkHit; terms: string[] }) {
  return (
    <div className="dm-card" style={{ background: "#fff", border: "1px solid #E7E0D2", borderRadius: 13, padding: "12px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8A8477" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5M9 13h6M9 17h4" /></svg>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.docLabel}</span>
        {p.page && <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", flexShrink: 0 }}>p.{p.page}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: "#57534A", lineHeight: 1.5 }}>
        “<Highlight text={p.text} terms={terms} />”
      </div>
    </div>
  );
}

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
  // "See in graph": the entity ids to highlight in the Explorer walk — from a
  // grounded answer's citations, or from the plain knowledge hits (no LLM).
  const [graphIds, setGraphIds] = useState<string[] | null>(null);
  const [graphVariant, setGraphVariant] = useState<"answer" | "results">("answer");

  const run = async (query: string) => {
    const term = query.trim();
    setSubmitted(term);
    if (!term) { setResult(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&answer=1`);
      const json = (await res.json()) as Partial<SearchResponse>;
      setResult({ query: json.query ?? term, terms: json.terms ?? [], total: json.total ?? 0, hits: json.hits ?? [], entities: json.entities ?? [], passages: json.passages ?? [], answer: json.answer ?? null });
    } catch {
      setResult({ query: term, terms: [], total: 0, hits: [], entities: [], passages: [], answer: null });
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
      <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", margin: "9px 2px 0" }}>Searches your tables and everything your agents know, then answers in plain language — every claim cited back to your own data.</div>

      {loading && <div className="dm-mono" style={{ color: "#A39B8B", fontSize: 13, padding: "30px 4px" }}>Searching &amp; composing an answer…</div>}

      {!loading && result && submitted && (
        result.total > 0 || result.entities.length > 0 || result.passages.length > 0 ? (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 22 }}>
            {result.answer && <AnswerCard answer={result.answer} onOpenTable={onOpenTable} onShowInGraph={(ids) => { setGraphVariant("answer"); setGraphIds(ids); }} />}
            {result.passages.length > 0 && (
              <div>
                <div className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B", marginBottom: 10 }}>In your documents · {result.passages.length}</div>
                <div className="dm-stagger" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.passages.map((p, i) => <PassageCard key={i} p={p} terms={result.terms} />)}
                </div>
              </div>
            )}
            {result.entities.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span className="dm-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A39B8B" }}>In your knowledge · {result.entities.length}</span>
                  {/* Works without any LLM — highlights the matched entities in the walk. */}
                  <button
                    type="button"
                    onClick={() => { setGraphVariant("results"); setGraphIds(result.entities.slice(0, 8).map((e) => e.id)); }}
                    title="Highlight these entities and their connections in the graph walk"
                    className="dm-mono"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, color: C.accent, background: "#fff", border: "1px solid #F3D6CB", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}
                  >◍ See in graph</button>
                </div>
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

      {graphIds && (
        <AnswerGraphModal question={submitted} entityIds={graphIds} variant={graphVariant} onClose={() => setGraphIds(null)} />
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

function ModalStep4({ name, setName, channels, mode, purpose, freestyle, targetTables, runtimeDot, runtimeLabel }: {
  name: string; setName: (v: string) => void;
  channels: string[]; mode: "auto" | "ping";
  purpose: "curate" | "auto"; freestyle: boolean; targetTables: string[];
  runtimeDot: string; runtimeLabel: string;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "A";
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
        <span className="dm-display" style={{ width: 46, height: 46, borderRadius: 13, background: pickColor(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19, flexShrink: 0 }}>{initial}</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ledger" style={{ flex: 1, border: "1px solid #DDD5C5", borderRadius: 11, padding: "12px 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 500, color: C.ink, background: "#fff", outline: "none" }} />
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

function CreateTableModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string | null) => void }) {
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
    // Capture the created id so the caller can land straight in the new grid.
    let createdId: string | null = null;
    run(async () => {
      const res = await createDatasetAction({ name: name.trim(), columns });
      if (res.ok) createdId = res.id ?? null;
      return res;
    }, () => onCreated(createdId));
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

/* ================================================================== */
/* SETTINGS: compute provider + plan                                  */
/* ================================================================== */
function SettingsModal({ settings, local, onClose, onSaved }: { settings: UserSettings; local?: boolean; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<ComputeMode>(settings.computeMode);
  const [provider, setProvider] = useState(settings.aiProvider);
  const [key, setKey] = useState("");
  const [cap, setCap] = useState(settings.byokMonthlyCapUsd != null ? String(settings.byokMonthlyCapUsd) : "");
  const { pending, error, run } = useAction();
  const [billing, startBilling] = useTransition();
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const limits = planLimits(settings.plan);
  // Local edition: computeMode "cloud" MEANS "local — models on this machine"
  // (the platform default is the host Ollama), and there is no plan gate.
  const cloudLocked = !limits.cloudCompute && !local;

  const save = () => run(
    () => updateComputeSettingsAction({
      computeMode: mode,
      aiProvider: provider,
      byokKey: key ? key : undefined,
      byokMonthlyCapUsd: cap.trim() === "" ? null : Number(cap),
    }),
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
      {/* Plan — cloud only; the local edition has no plans or billing. */}
      {!local && (
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
      )}

      {/* Compute mode. Local edition: LOCAL (this machine's Ollama) ↔ BYOK is a
          toggle — switching is never a reinstall. */}
      <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 10 }}>How should your data be analysed?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button type="button" disabled={cloudLocked} onClick={() => !cloudLocked && setMode("cloud")} style={{ ...modeCard(mode === "cloud"), opacity: cloudLocked ? 0.55 : 1, cursor: cloudLocked ? "not-allowed" : "pointer" }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>{local ? "Local — on this machine" : <>Datamodo cloud {cloudLocked && <span className="dm-mono" style={{ fontSize: 10, color: C.accent, marginLeft: 6 }}>Pro</span>}</>}</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>{local ? "Models run on your own machine via Ollama. Private, free, works offline." : <>We run the models for you. {cloudLocked ? "Upgrade to enable." : "Nothing to configure."}</>}</div>
          </div>
          <span style={radioDot(mode === "cloud")} />
        </button>
        <button type="button" onClick={() => setMode("byok")} style={modeCard(mode === "byok")}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Bring your own key</div>
            <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Analyse with your own Claude/OpenAI/OpenRouter key — or your own Ollama server, no key at all.</div>
          </div>
          <span style={radioDot(mode === "byok")} />
        </button>
      </div>

      {/* Local compute config: the Ollama server + which models read what.
          Everything the first-run wizard seeded stays editable here. */}
      {local && mode === "cloud" && (
        <div style={{ marginTop: 14, padding: "14px", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11 }}>
          <LocalAiFields />
        </div>
      )}

      {mode === "byok" && (
        <div style={{ marginTop: 14, padding: "14px", background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11 }}>
          <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 8 }}>Provider</div>
          <Segmented value={provider} onChange={setProvider} options={[{ v: "anthropic", label: "Claude" }, { v: "openai", label: "OpenAI" }, { v: "openrouter", label: "OpenRouter" }, { v: "ollama", label: "Ollama" }]} />
          <div className="dm-mono" style={{ ...fieldLabel, margin: "14px 0 8px" }}>{provider === "ollama" ? "Server URL" : "API key"}</div>
          {provider === "ollama" ? (
            <input type="text" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.byokKeySet ? "saved — paste to replace" : "http://localhost:11434 — or your tunnel URL"} style={fieldInput} />
          ) : (
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.byokKeySet ? "•••••••• (saved — paste to replace)" : provider === "openai" ? "sk-…" : provider === "openrouter" ? "sk-or-…" : "sk-ant-…"} style={fieldInput} />
          )}
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 8, lineHeight: 1.5 }}>
            {provider === "ollama"
              ? <>No API key needed — models run on <b>your own machine</b>. The URL must be reachable from datamodo&apos;s servers: on the same box use localhost; otherwise expose it via a tunnel (Tailscale funnel, ngrok, cloudflared). Pull a JSON-capable model first (ollama pull llama3.1).</>
              : <>This is an <b>API key</b> (billed per use), not your ChatGPT Plus / Claude Pro subscription — those don&apos;t grant API access. Get one from {provider === "openai" ? "platform.openai.com" : provider === "openrouter" ? "openrouter.ai/keys" : "console.anthropic.com"}. OpenRouter gives you one key across many models.</>}
          </div>
          {/* Spend cap: the safety rail on the user's own key. Empty = none.
              Ollama is keyless/free — the cap only applies to key-billed
              providers, so hide it there. */}
          {provider !== "ollama" && (
            <>
              <div className="dm-mono" style={{ ...fieldLabel, margin: "14px 0 8px" }}>Monthly spend cap (USD)</div>
              <input type="text" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="no cap — e.g. 10" style={fieldInput} />
              <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", marginTop: 6, lineHeight: 1.5 }}>
                When this month&apos;s tracked spend reaches the cap, datamodo stops using your key{local ? " and falls back to local Ollama" : " (items wait until you raise it or the month rolls over)"}. Estimates count — it&apos;s a safety rail, not an invoice.
              </div>
            </>
          )}
          {/* Local edition: pick the exact model names here instead of env vars
              — saved PER PROVIDER, so your Ollama names never reach Anthropic
              and vice-versa. (URL/status hidden — in BYOK the server/key field
              above says where.) */}
          {local && <LocalAiFields key={provider} provider={provider} apiKey={key} showUrl={false} showStatus={false} />}
        </div>
      )}

      {/* Your provider spend — what BYOK cost on YOUR key (not datamodo's
          plan). Only meaningful when you bring a key. */}
      {mode === "byok" && settings.aiProvider !== "ollama" && <UsageCard />}

      {/* Local edition: mailboxes datamodo pulls from over IMAP (no public URL
          for webhooks, so it pulls). CLI-managed too (`datamodo connect`). */}
      {local && <ConnectorsCard />}

      {/* Connect Claude (MCP): the vault as tools on the user's own Claude
          subscription — Claude extracts, the server pipeline stays the vault. */}
      <McpConnectCard />
    </ModalShell>
  );
}

/* Local edition — mailboxes datamodo pulls from over IMAP. A self-hosted
 * install has no public URL for webhooks, so it PULLS; this manages the same
 * connectors.json the `datamodo connect` CLI writes and the serve poller reads
 * (re-read each tick, so a change here takes effect within a minute, no
 * restart). Passwords are write-only: sent on add, never echoed back. */
type PublicConnector = { id: string; host: string; port: number; secure: boolean; user: string; mailbox: string };

function ConnectorsCard() {
  const [list, setList] = useState<PublicConnector[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ host: "", user: "", password: "", mailbox: "INBOX", port: "993", secure: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/local/connectors")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (live && json) setList(json.connectors as PublicConnector[]); })
      .catch(() => { /* leave null → hidden empty state */ });
    return () => { live = false; };
  }, []);

  const add = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/local/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, port: Number(form.port) || 993 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.error ?? "Couldn’t add that mailbox."); return; }
      setList(body.connectors as PublicConnector[]);
      setForm({ host: "", user: "", password: "", mailbox: "INBOX", port: "993", secure: true });
      setOpen(false);
    } catch {
      setErr("Couldn’t reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/local/connectors?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setList(body.connectors as PublicConnector[]);
    } finally {
      setBusy(false);
    }
  };

  const chip: React.CSSProperties = { fontSize: 11, color: "#3A352C", background: "#fff", border: "1px solid #ECE5D8", borderRadius: 8, padding: "7px 10px" };

  return (
    <div style={{ marginTop: 18, padding: "14px 16px", border: "1px solid #E7E0D2", borderRadius: 12, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z" /></svg> Mailboxes</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>datamodo pulls new mail from your own mailbox over IMAP and files it like anything else. Nothing leaves your machine but the IMAP connection you configure.</div>
        </div>
        {!open && (
          <Hov onClick={() => setOpen(true)} base={{ ...ghostBtn, flexShrink: 0 }} hover={{ background: "#FBF8F1" }}>Add mailbox</Hov>
        )}
      </div>

      {list && list.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="dm-mono" style={chip}>{c.user}@{c.host}:{c.port} · {c.mailbox}{c.secure ? "" : " · plaintext"}</div>
              <Hov onClick={busy ? undefined : () => void remove(c.id)} base={{ ...ghostBtn, flexShrink: 0, color: C.accent }} hover={{ background: "#FBF3EF" }}>Remove</Hov>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12, padding: 12, background: "#FBF8F1", border: "1px solid #ECE5D8", borderRadius: 11, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="text" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="IMAP host — e.g. imap.gmail.com" style={{ ...fieldInput, flex: "1 1 200px" }} />
            <input type="text" inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="993" style={{ ...fieldInput, flex: "0 0 84px", width: 84 }} />
          </div>
          <input type="text" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="mailbox login (usually your email)" autoComplete="off" style={fieldInput} />
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="password or app-specific password" autoComplete="new-password" style={fieldInput} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="text" value={form.mailbox} onChange={(e) => setForm({ ...form, mailbox: e.target.value })} placeholder="INBOX" style={{ ...fieldInput, flex: "1 1 160px" }} />
            <label className="dm-mono" style={{ fontSize: 11, color: "#8A8477", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> implicit TLS (993)
            </label>
          </div>
          <div className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", lineHeight: 1.5 }}>
            Gmail/Outlook need an <b>app-specific password</b> (2FA), not your account password. The credential is stored only in <span style={{ userSelect: "all" }}>~/.datamodo/connectors.json</span> on this machine.
          </div>
          {err && <div className="dm-mono" style={{ fontSize: 11, color: C.accent }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Hov onClick={busy ? undefined : () => { setOpen(false); setErr(null); }} base={ghostBtn} hover={{ background: "#fff" }}>Cancel</Hov>
            <Hov onClick={busy ? undefined : () => void add()} base={primaryBtn(busy)} hover={{ background: C.accentPress }}>{busy ? "Connecting…" : "Connect"}</Hov>
          </div>
        </div>
      )}

      {list && list.length === 0 && !open && (
        <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginTop: 10 }}>No mailboxes yet. New mail is captured while <span style={{ userSelect: "all" }}>datamodo serve</span> is running.</div>
      )}
    </div>
  );
}

/* Local edition — the AI panel, built for NON-DEV users: everything happens
 * here, never in a terminal. Persisted to ~/.datamodo/llm.json PER PROVIDER
 * (the wizard's Ollama names never reach a BYOK provider and vice-versa).
 *  • Ollama: live running/not-running status with retry, model DROPDOWNS from
 *    what's actually installed, one-click downloads of the models recommended
 *    for this machine, and a real "Test" call.
 *  • Claude/OpenAI/OpenRouter: "Test key" validates the key for free AND
 *    fetches the models the key can use → dropdowns instead of guessing ids.
 */
const PROVIDER_LABEL: Record<string, string> = { ollama: "Ollama", anthropic: "Claude", openai: "OpenAI", openrouter: "OpenRouter" };
const selectStyle: React.CSSProperties = { ...fieldInput, appearance: "auto" as never, cursor: "pointer" };

function LocalAiFields({ provider = "ollama", apiKey = "", showUrl = true, showStatus = true }: { provider?: string; apiKey?: string; showUrl?: boolean; showStatus?: boolean }) {
  const [extract, setExtract] = useState("");
  const [vision, setVision] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<{ url: string; reachable: boolean; tags: string[] } | null>(null);
  const [recommended, setRecommended] = useState<{ ramGb: number; tier: string; text: string; vision: string | null; embed: string } | null>(null);
  const [providerModels, setProviderModels] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [pulling, setPulling] = useState<string[]>([]);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState<"key" | "model" | null>(null);
  const isOllama = provider === "ollama";
  const tags = useMemo(() => (status?.tags ?? []).map((t) => t.replace(/:latest$/, "")), [status]);

  const load = (live?: { on: boolean }) => {
    fetch(`/api/local/llm-models?provider=${encodeURIComponent(provider)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && !live.on) return;
        if (j?.models) { setExtract(j.models.extract ?? ""); setVision(j.models.vision ?? ""); setUrl(j.models.url ?? ""); }
        if (j?.ollama) setStatus(j.ollama);
        if (j?.recommended) setRecommended(j.recommended);
      })
      .catch(() => { /* leave blank → defaults */ });
  };

  // Mount-only: the call site keys this component by provider, so switching
  // provider remounts with fresh (null) probe/test state — no manual resets.
  useEffect(() => {
    const live = { on: true };
    load(live);
    return () => { live.on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While a download runs, keep refreshing the installed list so the model
  // appears (and the button flips to ✓) the moment Ollama finishes.
  useEffect(() => {
    if (pulling.length === 0) return;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulling.length]);

  const save = async (next?: { extract?: string; vision?: string; url?: string }) => {
    const body = { extract: next?.extract ?? extract, vision: next?.vision ?? vision, ...(isOllama ? { url: next?.url ?? url } : {}) };
    try {
      const res = await fetch("/api/local/llm-models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, models: body }),
      });
      if (res.ok) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1600);
        if (isOllama) load(); // a URL change should refresh reachability + models
      }
    } catch { /* best-effort */ }
  };

  const probe = async (withModel: boolean) => {
    setTesting(withModel ? "model" : "key");
    setTestMsg(null);
    try {
      const model = withModel ? (extract || recommended?.text || undefined) : undefined;
      const res = await fetch("/api/local/llm-probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(isOllama ? { url: url || undefined } : { key: apiKey || undefined }),
          ...(model ? { model } : {}),
        }),
      });
      const j = await res.json();
      if (j.models && !isOllama) setProviderModels(j.models);
      if (isOllama) load();
      if (withModel && j.modelOk) setTestMsg({ ok: true, text: `✓ ${model} answered in ${((j.latencyMs ?? 0) / 1000).toFixed(1)}s — you're all set` });
      else if (!withModel && j.ok) setTestMsg({ ok: true, text: `✓ ${isOllama ? "Ollama is running" : `Your ${PROVIDER_LABEL[provider] ?? provider} key works`} · ${j.models?.length ?? 0} models available` });
      else setTestMsg({ ok: false, text: j.error ?? "Something didn't answer — try again." });
    } catch {
      setTestMsg({ ok: false, text: "Couldn't reach the app — is it still running?" });
    } finally {
      setTesting(null);
    }
  };

  const pull = async (model: string) => {
    setPulling((p) => [...p, model]);
    try {
      const res = await fetch("/api/local/ollama-pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) setTestMsg({ ok: false, text: j.error ?? `Couldn't download ${model}.` });
    } catch { /* the poll keeps watching either way */ }
    setPulling((p) => p.filter((m) => m !== model));
    load();
  };

  /** Model picker: a dropdown when we KNOW the choices (installed Ollama
   *  models / the key's model list), a free field otherwise. */
  const modelField = (value: string, onChange: (v: string) => void, kindLabel: string, defaultHint: string) => {
    const options = isOllama ? tags : providerModels;
    if (options && options.length > 0 && options.length <= 60) {
      const known = options.includes(value);
      return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "#A39B8B" }}>{kindLabel}</span>
          <select value={known ? value : value ? "__custom" : ""} onChange={(e) => { const v = e.target.value === "__custom" ? value : e.target.value; onChange(v); void save(kindLabel.startsWith("Text") ? { extract: v } : { vision: v }); }} style={selectStyle}>
            <option value="">{defaultHint}</option>
            {options.map((m) => <option key={m} value={m}>{m}</option>)}
            {!known && value && <option value="__custom">{value} (custom)</option>}
          </select>
        </label>
      );
    }
    const listId = `dm-models-${provider}-${kindLabel.split(" ")[0]}`;
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "#A39B8B" }}>{kindLabel}</span>
        {options && options.length > 0 && (
          <datalist id={listId}>{options.map((m) => <option key={m} value={m} />)}</datalist>
        )}
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => void save()} list={options?.length ? listId : undefined}
          placeholder={defaultHint} autoComplete="off" style={fieldInput} />
      </label>
    );
  };

  const missingRecommended = isOllama && recommended && status?.reachable
    ? [recommended.text, recommended.vision, recommended.embed].filter((m): m is string => Boolean(m) && !tags.includes(m!.replace(/:latest$/, "")))
    : [];

  return (
    <div style={showUrl ? undefined : { marginTop: 12, paddingTop: 12, borderTop: "1px solid #ECE5D8" }}>
      {/* ---- Ollama: running or not, in plain words, fixable in place ---- */}
      {showStatus && isOllama && status && (
        status.reachable ? (
          <div className="dm-mono" style={{ fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>● Ollama is running · {tags.length} model{tags.length === 1 ? "" : "s"} installed</span>
            <button type="button" onClick={() => load()} style={{ background: "none", border: "none", color: "#A39B8B", cursor: "pointer", fontSize: 10.5, padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>refresh</button>
          </div>
        ) : (
          <div style={{ padding: "10px 12px", background: "#FBF3EF", border: "1px solid #F0D9CF", borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Ollama isn’t running yet</div>
            <div style={{ fontSize: 12, color: "#57534A", marginTop: 4, lineHeight: 1.55 }}>
              Ollama is the free app that runs AI models on your machine.
              <br />1. Download it from <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ color: C.accent }}>ollama.com/download</a> and open it.
              <br />2. Come back and hit <b>Check again</b> — datamodo takes it from there.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <Hov onClick={() => load()} base={{ ...ghostBtn, fontSize: 12 }} hover={{ background: "#fff" }}>Check again</Hov>
              <span className="dm-mono" style={{ fontSize: 10, color: "#A39B8B" }}>meanwhile everything is still stored & filed — just not AI-read</span>
            </div>
          </div>
        )
      )}

      {/* ---- one-click downloads of what fits this machine ---- */}
      {missingRecommended.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="dm-mono" style={{ ...fieldLabel, marginBottom: 6 }}>Recommended for this machine ({recommended!.ramGb} GB)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {missingRecommended.map((m) => (
              <button key={m} type="button" disabled={pulling.includes(m)} onClick={() => void pull(m)}
                title={pulling.includes(m) ? "Downloading — this is a one-time multi-GB download" : `Download ${m} (one time)`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: C.ink, background: "#fff", border: "1px solid #E1D9C8", borderRadius: 999, padding: "4px 11px", cursor: pulling.includes(m) ? "default" : "pointer", fontFamily: "inherit", opacity: pulling.includes(m) ? 0.7 : 1 }}>
                {pulling.includes(m)
                  ? <><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B08A2E", animation: "cc-pulse 2.2s ease-in-out infinite" }} /> downloading {m}…</>
                  : <><span style={{ color: C.accent }}>⤓</span> {m}</>}
              </button>
            ))}
          </div>
          <div className="dm-mono" style={{ fontSize: 10, color: "#A39B8B", marginTop: 5 }}>one-time downloads (a few GB each) — they run 100% on this machine afterwards</div>
        </div>
      )}

      {/* ---- BYOK: prove the key works before saving anything ---- */}
      {!isOllama && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Hov onClick={testing ? undefined : () => void probe(false)} base={{ ...ghostBtn, fontSize: 12 }} hover={{ background: "#fff" }}>
            {testing === "key" ? "Testing…" : "Test key"}
          </Hov>
          <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>free check — lists the models your key can use</span>
        </div>
      )}

      <div className="dm-mono" style={{ ...fieldLabel, margin: "14px 0 8px" }}>
        Models {saved && <span style={{ color: C.green, marginLeft: 6 }}>✓ saved</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {modelField(extract, setExtract, "Text — reads messages & documents", isOllama ? `Recommended (${recommended?.text ?? "llama3.1:8b"})` : "Recommended (default)")}
        {modelField(vision, setVision, "Vision — reads photos & scanned PDFs", isOllama ? `Recommended (${recommended?.vision ?? "llava"})` : "Same as text model")}
      </div>

      {/* ---- advanced: custom Ollama server ---- */}
      {showUrl && isOllama && (
        <details style={{ marginTop: 12 }}>
          <summary className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", cursor: "pointer" }}>Advanced — Ollama runs on another machine?</summary>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => void save()}
            placeholder={status?.url ?? "http://localhost:11434"} autoComplete="off" style={{ ...fieldInput, marginTop: 8 }} />
        </details>
      )}

      {/* ---- the moment of truth: one real (tiny) model call ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Hov onClick={testing ? undefined : () => void probe(true)} base={{ ...primaryBtn(testing === "model"), padding: "7px 14px", fontSize: 12.5 }} hover={{ background: C.accentPress }}>
          {testing === "model" ? "Asking the model…" : "Test it"}
        </Hov>
        <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B" }}>sends one tiny question through the real pipeline</span>
      </div>
      {testMsg && (
        <div className="dm-mono dm-fade-in" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5, color: testMsg.ok ? C.green : C.accent }}>{testMsg.text}</div>
      )}
    </div>
  );
}

/* Your provider spend (BYOK) — what the user's OWN Anthropic/OpenAI/OpenRouter
 * key cost while datamodo used it. Lazy fetch; empty until calls land. */
function UsageCard() {
  const [sum, setSum] = useState<null | {
    totalCostUsd: number; hasUnpriced: boolean; calls: number; inputTokens: number; outputTokens: number;
    byModel: { provider: string; model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number | null; estimated: boolean }[];
  }>(null);
  const [priceDate, setPriceDate] = useState("");
  const [capInfo, setCapInfo] = useState<{ monthToDateUsd: number; capUsd: number | null } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/usage?days=30");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setSum(json.summary ?? null);
      setCapInfo({ monthToDateUsd: json.monthToDateUsd ?? 0, capUsd: json.capUsd ?? null });
      setPriceDate(json.priceDate ?? "");
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const usd = (n: number) => n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : "$0";
  const tok = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div style={{ marginTop: 18, padding: "14px 16px", border: "1px solid #E7E0D2", borderRadius: 12, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Your provider spend</div>
          <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>What your own API key cost while datamodo ran your data — last 30 days. Separate from your datamodo plan.</div>
        </div>
        {!sum && (
          <Hov onClick={state === "loading" ? undefined : () => void load()} base={{ ...ghostBtn, flexShrink: 0 }} hover={{ background: "#FBF8F1" }}>
            {state === "loading" ? "…" : "Show spend"}
          </Hov>
        )}
      </div>
      {state === "error" && <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginTop: 10 }}>Couldn&apos;t load usage.</div>}
      {sum && capInfo?.capUsd != null && (() => {
        const pct = Math.min(100, Math.round((capInfo.monthToDateUsd / capInfo.capUsd) * 100));
        const reached = capInfo.monthToDateUsd >= capInfo.capUsd;
        return (
          <div style={{ marginTop: 12, padding: "10px 12px", background: reached ? "#FBF3EF" : "#FBF8F1", border: `1px solid ${reached ? "#F0D9CF" : "#ECE5D8"}`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span className="dm-mono" style={{ fontSize: 11, fontWeight: 600, color: reached ? C.accent : "#3A352C" }}>
                {reached ? "Monthly cap reached — your key is paused" : "Monthly cap"}
              </span>
              <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477" }}>{usd(capInfo.monthToDateUsd)} of {usd(capInfo.capUsd)} this month</span>
            </div>
            <div style={{ height: 5, background: "#EFE9DC", borderRadius: 999, marginTop: 7, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: reached ? C.accent : "#B08A2E", borderRadius: 999 }} />
            </div>
          </div>
        );
      })()}
      {sum && (
        <div style={{ marginTop: 12 }}>
          {sum.calls === 0 ? (
            <div className="dm-mono" style={{ fontSize: 11.5, color: "#A39B8B" }}>No calls tracked yet — spend appears here after your agents read something on your key.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span className="dm-mono" style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{usd(sum.totalCostUsd)}{sum.hasUnpriced ? "+" : ""}</span>
                <span className="dm-mono" style={{ fontSize: 11, color: "#8A8477" }}>{sum.calls} call{sum.calls === 1 ? "" : "s"} · {tok(sum.inputTokens)} in / {tok(sum.outputTokens)} out</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sum.byModel.slice(0, 8).map((m) => (
                  <div key={`${m.provider}:${m.model}`} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
                    <span className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", textTransform: "uppercase", flexShrink: 0, width: 66, overflow: "hidden", textOverflow: "ellipsis" }}>{m.provider}</span>
                    <span style={{ color: "#3A352C", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.model}</span>
                    <span className="dm-mono" style={{ fontSize: 10.5, color: "#A39B8B", flexShrink: 0 }}>{tok(m.inputTokens + m.outputTokens)} tok</span>
                    <span className="dm-mono" style={{ fontSize: 12, fontWeight: 600, color: m.costUsd === null ? "#B7AF9F" : C.ink, flexShrink: 0, width: 62, textAlign: "right" }}>
                      {m.costUsd === null ? "—" : `${m.estimated ? "~" : ""}${usd(m.costUsd)}`}
                    </span>
                  </div>
                ))}
              </div>
              <div className="dm-mono" style={{ fontSize: 9.5, color: "#B7AF9F", marginTop: 10, lineHeight: 1.5 }}>
                {sum.byModel.some((m) => m.estimated) && <>~ = estimated from token counts (list prices{priceDate ? `, ${priceDate}` : ""}); </>}OpenRouter figures are exact. &quot;—&quot; = model we don&apos;t price. Ollama is free and not shown.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* Connect Claude (MCP) — lazy: details fetch only when asked for (the token
 * is derived server-side; showing it writes nothing). Once revealed, the card
 * also lists the apps connected via OAuth, each with a Disconnect that
 * revokes its tokens on the spot. */
type McpGrant = { clientId: string; clientName: string; tokens: number; connectedAt: string };

/** One-click copy with feedback — the connect flow must never require
 *  text-selection gymnastics. */
function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Hov
      onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      base={{ ...ghostBtn, flexShrink: 0, padding: "6px 12px", fontSize: 11.5, ...(copied ? { color: C.accent } : {}) }}
      hover={{ background: "#FBF8F1" }}
    >
      {copied ? "Copied ✓" : label ?? "⧉ Copy"}
    </Hov>
  );
}

function McpConnectCard() {
  const [conn, setConn] = useState<{ url: string; token: string | null; grants?: McpGrant[] } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unconfigured" | "error">("loading");
  const [devOpen, setDevOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  // The URL isn't a secret — load it up front so the card IS the guide.
  // (The bearer token stays folded behind the developer disclosure.)
  useEffect(() => {
    let alive = true;
    void fetch("/api/mcp-token")
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 501) { setState("unconfigured"); return; }
        if (!res.ok) throw new Error();
        setConn(await res.json());
        setState("ready");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, []);
  const disconnect = async (clientId: string) => {
    setRevoking(clientId);
    try {
      const res = await fetch(`/api/mcp-token?client_id=${encodeURIComponent(clientId)}`, { method: "DELETE" });
      if (res.ok) {
        const j = await res.json();
        setConn((c) => (c ? { ...c, grants: j.grants ?? [] } : c));
      }
    } catch { /* card keeps its state; retry is a click away */ } finally {
      setRevoking(null);
    }
  };
  const mono: React.CSSProperties = { fontSize: 11, color: "#3A352C", background: "#fff", border: "1px solid #ECE5D8", borderRadius: 8, padding: "7px 10px", overflowWrap: "anywhere", userSelect: "all", minWidth: 0, flex: 1 };
  const stepNo: React.CSSProperties = { color: C.accent, fontWeight: 700, flexShrink: 0, width: 16 };
  const step: React.CSSProperties = { display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, color: "#3A352C", lineHeight: 1.55 };
  const codeLine = conn
    ? `claude mcp add --transport http datamodo ${conn.url}${conn.token ? ` --header "Authorization: Bearer ${conn.token}"` : ""}`
    : "";
  return (
    <div style={{ marginTop: 18, padding: "14px 16px", border: "1px solid #E7E0D2", borderRadius: 12, background: "#fff" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}><span style={{ color: C.accent }}>✦</span> Connect Claude</div>
        <div style={{ fontSize: 12.5, color: "#8A8477", marginTop: 2 }}>Talk to your vault from any Claude chat — Claude reads your graph, files what you tell it, and asks before merging. Runs on your Claude subscription; no API key, no config files.</div>
      </div>
      {state === "loading" && <div className="dm-mono" style={{ fontSize: 11, color: "#A39B8B", marginTop: 10 }}>…</div>}
      {state === "unconfigured" && <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginTop: 10 }}>MCP isn&apos;t configured on this deployment yet.</div>}
      {state === "error" && <div className="dm-mono" style={{ fontSize: 11, color: "#8A8477", marginTop: 10 }}>Couldn&apos;t load the connection — reload the page to retry.</div>}
      {conn && state === "ready" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="dm-mono" style={mono}>{conn.url}</div>
            <CopyBtn value={conn.url} label="⧉ Copy URL" />
          </div>
          {conn.token ? (
            // CLOUD: OAuth makes this a paste-one-URL flow — lead with it.
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={step}><span style={stepNo}>1</span><span>Copy the URL above.</span></div>
              <div style={step}>
                <span style={stepNo}>2</span>
                <span>
                  In Claude, open{" "}
                  <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.accent}` }}>
                    Settings → Connectors ↗
                  </a>{" "}
                  → <b>Add custom connector</b> → paste the URL. (Same path in the Claude desktop and mobile apps.)
                </span>
              </div>
              <div style={step}><span style={stepNo}>3</span><span>Claude sends you here to approve — click <b>Approve</b> and you&apos;re connected. That&apos;s it: no JSON files, no tokens to paste.</span></div>
            </div>
          ) : (
            // LOCAL: claude.ai (the website) can't reach this machine — the
            // desktop app and Claude Code on THIS machine are the doors.
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={step}><span style={stepNo}>1</span><span>Copy the URL above. (No token needed — this vault lives on your machine, and only this machine can reach it.)</span></div>
              <div style={step}><span style={stepNo}>2</span><span>In the <b>Claude desktop app</b> (on this machine): Settings → Connectors → <b>Add custom connector</b> → paste the URL.</span></div>
              <div style={step}><span style={stepNo}>3</span><span>Done — no JSON files to edit. (claude.ai in the browser can&apos;t reach localhost; use the desktop app or Claude Code.)</span></div>
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => setDevOpen((v) => !v)}
              className="dm-mono"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 10.5, color: "#A39B8B", letterSpacing: "0.04em" }}
            >
              {devOpen ? "▾" : "▸"} Claude Code &amp; API {conn.token ? "(shows your access token)" : ""}
            </button>
            {devOpen && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="dm-mono" style={mono}>{codeLine}</div>
                  <CopyBtn value={codeLine} label="⧉ Copy" />
                </div>
                {conn.token && (
                  <>
                    <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "#A39B8B" }}>Access token — treat it like a password</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div className="dm-mono" style={mono}>{conn.token}</div>
                      <CopyBtn value={conn.token} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {(conn.grants?.length ?? 0) > 0 && (
            <>
              <div className="dm-mono" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "#A39B8B", marginTop: 4 }}>Connected apps</div>
              {conn.grants!.map((g) => (
                <div key={g.clientId} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="dm-mono" style={{ fontSize: 11, color: "#3A352C", background: "#fff", border: "1px solid #ECE5D8", borderRadius: 8, padding: "7px 10px", minWidth: 0 }}>
                    {g.clientName} · since {g.connectedAt.slice(0, 10)}
                  </div>
                  <Hov onClick={revoking ? undefined : () => void disconnect(g.clientId)} base={{ ...ghostBtn, flexShrink: 0, color: C.accent }} hover={{ background: "#FBF3EF" }}>
                    {revoking === g.clientId ? "Disconnecting…" : "Disconnect"}
                  </Hov>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

