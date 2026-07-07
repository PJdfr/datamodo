import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { listAgents } from "@/lib/datamodo/agents";
import { listDatasets } from "@/lib/datamodo/datasets";
import { getSettings, type UserSettings } from "@/lib/datamodo/settings";
import type { AgentRecord, DatasetView } from "@/lib/datamodo/types";
import ControlCenter from "./control-center";

export default async function DashboardPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Best-effort: show the user's real forwarding inbox if the table exists.
  const { data: addrs } = await supabase
    .from("forwarding_addresses")
    .select("address")
    .limit(1);
  const inbox = addrs?.[0]?.address ?? "u8x2@datamodo.in";

  const fullName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    user?.email?.split("@")[0] ||
    "You";
  const initial = fullName.charAt(0).toUpperCase();

  // Real structured layer: the user's active org, its agents, and its datasets.
  // Loads are defensive: if a query fails (most often because the database is
  // behind on migrations), we render an empty dashboard with a notice rather
  // than crashing the whole page ("this page could not load").
  let agents: AgentRecord[] = [];
  let datasets: DatasetView[] = [];
  let settings: UserSettings = { plan: "free", computeMode: "byok", aiProvider: "anthropic", byokKeySet: false, planStatus: null, currentPeriodEnd: null };
  let notice: string | null = null;
  const SCHEMA_NOTICE =
    "Some data couldn’t load — your database may be missing a migration. Run `supabase db push` (hosted) or `supabase db reset` (local) to apply the latest migrations.";

  if (user) {
    try {
      const org = await getActiveOrg(supabase, user.id);
      try {
        settings = await getSettings(supabase, user.id);
      } catch {
        notice = SCHEMA_NOTICE;
      }
      if (org) {
        const [ag, ds] = await Promise.allSettled([
          listAgents(supabase, org.id),
          listDatasets(supabase, org.id),
        ]);
        if (ag.status === "fulfilled") agents = ag.value; else notice = SCHEMA_NOTICE;
        if (ds.status === "fulfilled") datasets = ds.value; else notice = SCHEMA_NOTICE;
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
      settings={settings}
      notice={notice}
    />
  );
}
