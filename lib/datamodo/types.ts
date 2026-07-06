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

/** A dataset enriched with derived fields for the dashboard. */
export interface DatasetView extends DatasetRecord {
  agentName: string | null;
  rowCount: number;
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
