import { getSessionUser, getOrCreateOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listAgents } from "@/lib/datamodo/agents";
import { listDatasets } from "@/lib/datamodo/datasets";
import { listRelations } from "@/lib/datamodo/relations";
import { listPendingChanges } from "@/lib/datamodo/review";
import { listAgentActivity } from "@/lib/datamodo/activity";
import { getSettings, getOnboardingContext, type UserSettings, type OnboardingContext } from "@/lib/datamodo/settings";
import { inboundEmailDomain, provisionInbox } from "@/lib/datamodo/inbox";
import type { AgentActivityEntry, AgentRecord, DatasetRelation, DatasetView, ReviewItem } from "@/lib/datamodo/types";
import ControlCenter from "./control-center";

export default async function DashboardPage() {
  const user = await getSessionUser();

  let inbox = `you@${inboundEmailDomain()}`;

  const fullName =
    (user?.name as string | undefined)?.trim() ||
    user?.email?.split("@")[0] ||
    "You";
  const initial = fullName.charAt(0).toUpperCase();

  // Real structured layer: the user's active org, its agents, and its datasets.
  // Loads are defensive: if a query fails (most often because the database is
  // behind on migrations), we render an empty dashboard with a notice rather
  // than crashing the whole page ("this page could not load").
  let agents: AgentRecord[] = [];
  let datasets: DatasetView[] = [];
  let relations: DatasetRelation[] = [];
  let pendingChanges: ReviewItem[] = [];
  let pendingReviewCount = 0;
  let agentActivity: Record<string, AgentActivityEntry[]> = {};
  let settings: UserSettings = { plan: "free", computeMode: "byok", aiProvider: "anthropic", byokKeySet: false, planStatus: null, currentPeriodEnd: null };
  let onboarding: OnboardingContext = { businessContext: null, answers: {} };
  let notice: string | null = null;
  const SCHEMA_NOTICE =
    "Some data couldn’t load — your database may be missing a migration. Run `supabase db push` (hosted) or `supabase db reset` (local) to apply the latest migrations.";

  if (user) {
    try {
      const org = await getOrCreateOrg(user);
      try {
        settings = await getSettings(user.id);
      } catch {
        notice = SCHEMA_NOTICE;
      }
      try {
        onboarding = await getOnboardingContext(user.id);
      } catch {
        /* table may be behind on migrations — leave defaults */
      }
      if (org) {
        // Ensure the user has a capture inbox (best-effort — never blocks render).
        try {
          inbox = await provisionInbox(org.id, user.id);
        } catch {
          /* keep the placeholder */
        }
        const [ag, ds, rel, pend, act] = await Promise.allSettled([
          listAgents(org.id),
          listDatasets(org.id),
          listRelations(org.id),
          listPendingChanges(org.id),
          listAgentActivity(org.id),
        ]);
        if (ag.status === "fulfilled") agents = ag.value; else notice = SCHEMA_NOTICE;
        if (ds.status === "fulfilled") datasets = ds.value; else notice = SCHEMA_NOTICE;
        if (rel.status === "fulfilled") relations = rel.value; else notice = SCHEMA_NOTICE;
        if (pend.status === "fulfilled") pendingChanges = pend.value; else notice = SCHEMA_NOTICE;
        if (act.status === "fulfilled") agentActivity = act.value; else notice = SCHEMA_NOTICE;
        // Pending knowledge reviews (merges/conflicts/extractions) for the Review tab badge.
        try {
          pendingReviewCount = await prisma.knowledge_reviews.count({
            where: { org_id: org.id, status: "pending" },
          });
        } catch {
          /* table may be behind on migrations — leave 0 */
        }
      }
    } catch {
      notice = SCHEMA_NOTICE;
    }
  }

  return (
    <ControlCenter
      fullName={fullName}
      initial={initial}
      inbox={inbox}
      agents={agents}
      datasets={datasets}
      relations={relations}
      pendingChanges={pendingChanges}
      pendingReviewCount={pendingReviewCount}
      agentActivity={agentActivity}
      settings={settings}
      onboarding={onboarding}
      notice={notice}
    />
  );
}
