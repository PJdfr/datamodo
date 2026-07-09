import { prisma } from "@/lib/prisma";
import type { ActiveOrg } from "./types";

// Resolve the user's personal org — the invisible per-user data boundary every
// account gets at signup. This product is individual-only: there are no team
// orgs, so this is simply "the user's bucket".
export async function getActiveOrg(userId: string): Promise<ActiveOrg | null> {
  const data = await prisma.organization_members.findMany({
    where: { user_id: userId },
    select: {
      role: true,
      organizations: {
        select: { id: true, name: true, slug: true, is_personal: true },
      },
    },
  });

  if (!data || data.length === 0) return null;

  const rows = data.map((r) => ({
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
