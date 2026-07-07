// Shared types for the structured layer (agents + datasets) that sits on top of
// the raw capture store. These mirror the columns in the
// 20260707120000_agents_datasets.sql migration.

export type AgentMode = "auto" | "ping";
export type AgentPurposeKind = "curate" | "auto";
export type AgentStatus = "active" | "paused";
export type DatasetRowStatus = "accepted" | "proposed";

/** A row of the `agents` table. */
export interface AgentRecord {
  id: string;
  org_id: string;
  owner_user_id: string;
  name: string;
  purpose_text: string | null;
  purpose: AgentPurposeKind;
  channels: string[];
  mode: AgentMode;
  status: AgentStatus;
  freestyle: boolean;
  avatar_bg: string | null;
  created_at: string;
  updated_at: string;
}

/** A dataset column definition (stored as jsonb on `datasets.columns`). */
export interface DatasetColumn {
  key: string;
  label: string;
  type: string; // 'text' | 'number' | 'date' | 'status' | ...
}

/** A row of the `datasets` table. */
export interface DatasetRecord {
  id: string;
  org_id: string;
  agent_id: string | null;
  name: string;
  description: string | null;
  columns: DatasetColumn[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** One editable row of a dataset. */
export interface DatasetRowRecord {
  id: string;
  data: Record<string, unknown>;
  /** True once a human has edited this row — protects it from silent overwrite. */
  humanEdited: boolean;
}

/** A version-history entry (metadata only; full rows loaded on restore). */
export interface SnapshotMeta {
  id: string;
  actor: string;
  summary: string;
  createdAt: string;
}

/** A pending change proposed by an agent, awaiting the user's review. */
export interface Proposal {
  id: string;
  kind: "add" | "update";
  proposedBy: string;
  data: Record<string, unknown>;
  /** For 'update': the row it targets and that row's current values. */
  targetRowId: string | null;
  currentData: Record<string, unknown> | null;
  /** True when it changes a row the human already edited (a real conflict). */
  conflict: boolean;
}

/** A dataset enriched with derived fields + its rows for the dashboard. */
export interface DatasetView extends DatasetRecord {
  agentName: string | null;
  rowCount: number;
  rows: DatasetRowRecord[];
  history: SnapshotMeta[];
  proposals: Proposal[];
}

/** Input for creating an agent (collected by the New-agent wizard). */
export interface NewAgentInput {
  name: string;
  purposeText?: string | null;
  purpose?: AgentPurposeKind;
  channels?: string[];
  mode?: AgentMode;
  freestyle?: boolean;
  avatarBg?: string | null;
  /** Existing dataset names to bind this agent to (best-effort). */
  targetDatasetNames?: string[];
}

export interface ActiveOrg {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: string;
}
