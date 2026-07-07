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

/** A version-history entry WITH its full point-in-time contents (for
 *  preview + comparing versions). */
export interface SnapshotFull extends SnapshotMeta {
  columns: DatasetColumn[];
  rows: { data: Record<string, unknown> }[];
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
  /** The batch this proposal belongs to — the chunk accepted/rejected together. */
  batchId: string | null;
  createdAt: string;
  /** The message/email this was parsed from, if any (e.g. an email subject). */
  sourceLabel: string | null;
}

/** A reviewable chunk: every proposal produced together in one run, grouped so
 *  the user accepts/rejects the whole thing (not cell-by-cell). */
export interface ChangeChunk {
  batchId: string;
  proposedBy: string;
  createdAt: string;
  sourceLabel: string | null;
  proposals: Proposal[];
  adds: number;
  updates: number;
  conflicts: number;
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

// ---------------------------------------------------------------------------
// Relationships between tables (Data page graph)
// ---------------------------------------------------------------------------

/** An explicit link: `fromColumn` in one table references rows in another table
 *  matched on `toColumn` (FK-like). */
export interface DatasetRelation {
  id: string;
  fromDatasetId: string;
  fromDatasetName: string;
  fromColumn: string;
  toDatasetId: string;
  toDatasetName: string;
  toColumn: string;
  label: string | null;
}

// ---------------------------------------------------------------------------
// Versioning surface (unified pull-request review)
// ---------------------------------------------------------------------------

/** One field's before/after inside an updated row's diff. */
export interface DiffCell {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

/** A single pending change across the whole workspace, enriched for review.
 *  This is the atom the Versioning surface groups (by agent / table / comm)
 *  and accepts/rejects (singly, in bulk, or as whole groups). */
export interface ReviewItem {
  id: string; // the proposal row id
  kind: "add" | "update";
  datasetId: string;
  datasetName: string;
  columns: DatasetColumn[];
  agent: string;
  batchId: string | null;
  sourceLabel: string | null;
  createdAt: string;
  conflict: boolean;
  /** New-row values (kind === 'add') keyed by column. */
  data: Record<string, unknown>;
  /** Per-column before/after for updates (kind === 'update'). */
  cells: DiffCell[];
}

// ---------------------------------------------------------------------------
// Agent activity feed (Agents surface)
// ---------------------------------------------------------------------------

/** One thing an agent did recently: a change it applied (from a snapshot) or a
 *  change it's still proposing (pending review). */
export interface AgentActivityEntry {
  id: string;
  kind: "applied" | "pending";
  datasetName: string;
  summary: string;
  sourceLabel: string | null;
  adds: number;
  updates: number;
  conflicts: number;
  when: string;
}
