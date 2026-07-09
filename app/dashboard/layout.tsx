import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  // Belt-and-suspenders: proxy.ts already guards /dashboard.
  if (!user) redirect("/login");

  return <div className="dm-app">{children}</div>;
}
