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
  let agents: AgentRecord[] = [];
  let datasets: DatasetView[] = [];
  let settings: UserSettings = { plan: "free", computeMode: "byok", aiProvider: "anthropic", byokKeySet: false, planStatus: null, currentPeriodEnd: null };
  if (user) {
    const org = await getActiveOrg(supabase, user.id);
    settings = await getSettings(supabase, user.id);
    if (org) {
      [agents, datasets] = await Promise.all([
        listAgents(supabase, org.id),
        listDatasets(supabase, org.id),
      ]);
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
    />
  );
}
