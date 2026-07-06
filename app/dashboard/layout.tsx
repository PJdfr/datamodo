import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: proxy.ts already guards /dashboard.
  if (!user) redirect("/login");

  return <div className="dm-app">{children}</div>;
}
