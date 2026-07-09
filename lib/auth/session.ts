import { auth } from "./server";
import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { provisionInbox } from "@/lib/datamodo/inbox";
import type { ActiveOrg } from "@/lib/datamodo/types";

export type SessionUser = { id: string; email: string; name: string | null };

/** The signed-in user, or null. Replaces `supabase.auth.getUser()`. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { data: session } = await auth.getSession();
  const u = session?.user;
  if (!u) return null;
  return { id: u.id, email: u.email ?? "", name: u.name ?? null };
}

/**
 * App-layer authz entry point: the signed-in user + their personal org, or null
 * if not signed in. Every server action / route handler / page uses this instead
 * of RLS. Lazily provisions the personal org on first access, so it covers both
 * email/password sign-up and OAuth (which has no explicit sign-up action).
 */
export async function requireUserOrg(): Promise<{ user: SessionUser; org: ActiveOrg } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return { user, org: await getOrCreateOrg(user) };
}

/** The user's personal org, provisioning it on first access. Use this at
 *  authenticated entry points (dashboard page/layout) so a freshly signed-up
 *  user — including OAuth — gets their org/profile/settings/inbox created. */
export async function getOrCreateOrg(user: SessionUser): Promise<ActiveOrg> {
  return (await getActiveOrg(user.id)) ?? provisionPersonalOrg(user);
}

/**
 * Create a user's personal org + profile + settings + inbox on first sign-in.
 * Reimplements the old `handle_new_user` Postgres trigger in app code (Neon Auth
 * users live in the neon_auth schema; there is no trigger on them).
 */
async function provisionPersonalOrg(user: SessionUser): Promise<ActiveOrg> {
  const name = (user.name || user.email.split("@")[0] || "New user").trim();

  const org = await prisma.$transaction(async (tx) => {
    await tx.profiles.upsert({
      where: { id: user.id },
      create: { id: user.id, email: user.email, full_name: name },
      update: {},
    });
    const created = await tx.organizations.create({
      data: {
        name,
        slug: `personal-${user.id.slice(0, 8)}`,
        is_personal: true,
        created_by: user.id,
      },
    });
    await tx.organization_members.create({
      data: { org_id: created.id, user_id: user.id, role: "owner" },
    });
    await tx.user_settings.upsert({
      where: { user_id: user.id },
      create: { user_id: user.id },
      update: {},
    });
    return created;
  });

  // Best-effort inbound email address (its own unique-retry loop).
  await provisionInbox(org.id, user.id).catch(() => {});

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    isPersonal: org.is_personal,
    role: "owner",
  };
}
