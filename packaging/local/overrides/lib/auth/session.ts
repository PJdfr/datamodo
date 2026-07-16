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

/** The user's personal org, provisioning it on first access. Race-safe: a
 *  fresh dashboard load fires several parallel requests — the provisioning
 *  loser's unique-violation resolves to the winner's org. */
export async function getOrCreateOrg(user: SessionUser): Promise<ActiveOrg> {
  const existing = await getActiveOrg(user.id);
  if (existing) return existing;
  try {
    return await provisionPersonalOrg(user);
  } catch (e) {
    const raced = await getActiveOrg(user.id);
    if (raced) return raced;
    throw e;
  }
}

/** Create the personal org + profile + settings on the very first boot.
 *  Deliberately NOT a $transaction: the embedded pglite is ONE shared session,
 *  where two interleaved interactive transactions corrupt each other (a nested
 *  BEGIN is a no-op, so one ROLLBACK undoes both). Sequential idempotent
 *  upserts self-heal instead — a concurrent or crashed run converges. */
async function provisionPersonalOrg(user: SessionUser): Promise<ActiveOrg> {
  const name = (user.name || user.email.split("@")[0] || "New user").trim();
  const slug = `personal-${user.id.slice(0, 8)}`;

  await prisma.profiles.upsert({
    where: { id: user.id },
    create: { id: user.id, email: user.email, full_name: name },
    update: {},
  });
  let org = await prisma.organizations.findFirst({ where: { slug } });
  if (!org) {
    try {
      org = await prisma.organizations.create({
        data: { name, slug, is_personal: true, created_by: user.id },
      });
    } catch (e) {
      org = await prisma.organizations.findFirst({ where: { slug } }); // lost the race — reuse the winner's
      if (!org) throw e;
    }
  }
  await prisma.organization_members.upsert({
    where: { org_id_user_id: { org_id: org.id, user_id: user.id } },
    create: { org_id: org.id, user_id: user.id, role: "owner" },
    update: {},
  });
  await prisma.user_settings.upsert({
    where: { user_id: user.id },
    create: { user_id: user.id },
    update: {},
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
