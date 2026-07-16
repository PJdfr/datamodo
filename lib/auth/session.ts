import { getAuth } from "./server";
import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/datamodo/orgs";
import { provisionInbox } from "@/lib/datamodo/inbox";
import { isLocalMode, LOCAL_USER } from "@/lib/local/config";
import type { ActiveOrg } from "@/lib/datamodo/types";

export type SessionUser = { id: string; email: string; name: string | null };

/** The signed-in user, or null. Replaces `supabase.auth.getUser()`.
 *  Local edition: there is exactly one user (the person at the keyboard), so
 *  auth is a constant — no Neon Auth, no login — and provisioning runs the
 *  same as any first sign-in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (isLocalMode()) return { ...LOCAL_USER };
  const { data: session } = await (await getAuth()).getSession();
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
 *  user — including OAuth — gets their org/profile/settings/inbox created.
 *  Race-safe: two parallel first requests both reach provisioning (a fresh
 *  dashboard load fires several) — the loser's unique-violation resolves to
 *  the winner's org instead of failing the request. */
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

/**
 * Create a user's personal org + profile + settings + inbox on first sign-in.
 * Reimplements the old `handle_new_user` Postgres trigger in app code (Neon Auth
 * users live in the neon_auth schema; there is no trigger on them).
 *
 * Deliberately NOT a $transaction: every step is an idempotent upsert keyed on
 * stable ids, so a concurrent or crashed run self-heals on the next call. On
 * the local edition's embedded pglite (ONE shared session) two interleaved
 * interactive transactions corrupt each other (a nested BEGIN is a no-op, so
 * one ROLLBACK undoes both) — sequential idempotent steps sidestep that whole
 * class, and the cloud is equally happy with them.
 */
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
