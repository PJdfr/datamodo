import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
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

  return <ControlCenter fullName={fullName} initial={initial} inbox={inbox} />;
}
