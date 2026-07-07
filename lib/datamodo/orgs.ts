import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveOrg } from "./types";

// Resolve the user's personal org — the invisible per-user data boundary every
// account gets at signup. This product is individual-only: there are no team
// orgs, so this is simply "the user's bucket".
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

  // Every user has exactly one personal org; fall back to the first membership.
  const personal = rows.find((r) => r.isPersonal);
  return personal ?? rows[0];
}
