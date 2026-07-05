import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { signout } from "@/app/auth/actions";

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">Datamodo</span>
        <div className="app-header-right">
          <span className="muted small">{user.email}</span>
          <form action={signout}>
            <button type="submit" className="btn btn-outline btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="app-body">{children}</div>
    </div>
  );
}
