import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { provisionInbox } from "@/lib/datamodo/inbox";
import { LOCAL_USER } from "@/lib/local/config";
import type { ActiveOrg } from "@/lib/datamodo/types";

// LOCAL EDITION build of lib/auth/session.ts — no auth at all. There is
// exactly one user (the person at the keyboard), so the session is a constant
// and provisioning runs like any first sign-in. The cloud edition's Neon Auth
// integration is closed-layer and not part of this package;
// scripts/build-local-package.mjs swaps this file in.

export type SessionUser = { id: string; email: string; name: string | null };

/** The one local user — always signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return { ...LOCAL_USER };
}

/** App-layer authz entry point: the local user + their personal org. */
export async function requireUserOrg(): Promise<{ user: SessionUser; org: ActiveOrg } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return { user, org: await getOrCreateOrg(user) };
}

/** The user's personal org, provisioning it on first access. */
export async function getOrCreateOrg(user: SessionUser): Promise<ActiveOrg> {
  return (await getActiveOrg(user.id)) ?? provisionPersonalOrg(user);
}

/** Create the personal org + profile + settings on the very first boot. */
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

  // Best-effort inbound address bookkeeping (harmless locally).
  await provisionInbox(org.id, user.id).catch(() => {});

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    isPersonal: org.is_personal,
    role: "owner",
  };
}
