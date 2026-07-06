import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveOrg } from "./types";

// Resolve the org the dashboard should act in. Until a real org switcher lands
// (roadmap step 1), we pick deterministically: a team org if the user has one,
// otherwise their personal org. Org switching will later persist an explicit
// choice instead.
export async function getActiveOrg(
  db: SupabaseClient,
  userId: string,
): Promise<ActiveOrg | null> {
  const { data, error } = await db
    .from("organization_members")
    .select("role, organizations!inner (id, name, slug, is_personal)")
    .eq("user_id", userId);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  type Row = {
    role: string;
    organizations: {
      id: string;
      name: string;
      slug: string;
      is_personal: boolean;
    };
  };
  // Supabase types the embedded relation loosely; normalize it here.
  const rows = (data as unknown as Row[]).map((r) => ({
    id: r.organizations.id,
    name: r.organizations.name,
    slug: r.organizations.slug,
    isPersonal: r.organizations.is_personal,
    role: r.role,
  }));

  // Prefer a shared/team org; fall back to the personal one.
  const team = rows.find((r) => !r.isPersonal);
  return team ?? rows[0];
}
