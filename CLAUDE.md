@AGENTS.md

## Product model: individual users only

This product is **individual-only** — there are no teams, orgs, sharing, or
multi-user features, and none should be added without an explicit decision.
Every agent, dataset, and row is private to its owner. Each user still gets one
auto-created "personal org" at signup, but it exists purely as an invisible
per-user data boundary (tables key off `org_id` = that single personal org);
it is never shown in the UI and users cannot create or join additional orgs.

## Stack: Neon + Prisma + Neon Auth (migrated off Supabase)

The app runs on **Neon Postgres** via **Prisma** (`lib/prisma.ts`, `@prisma/adapter-neon`)
with **Neon Auth** (Better Auth) for auth (`lib/auth/*`). Authz is **app-layer**
(scope every query by `org_id`; no RLS). Schema source of truth is
[`neon/schema.sql`](neon/schema.sql) / `prisma/schema.prisma` (`prisma db pull`).
There is no `supabase/` dir anymore. See `PROJECT_STATE.md` "Neon migration plan".

## Local demo data (keep this working)

The demo account **user@example.com** must always have fake data seeded — a
personal org plus several `agents`, their `datasets`, `dataset_rows`, and the
knowledge layer (entities/facts). Canonical signed-in state for local dev.

- Neon Auth owns users, so the seed can't create the auth user via SQL. Flow:
  **sign up `user@example.com` in the app** (Neon Auth provisions the profile/org),
  then run [`neon/seed.sql`](neon/seed.sql) against the branch
  (`psql "$DATABASE_URL" -f neon/seed.sql`). It's idempotent (no-ops if the org
  already has agents) and resolves the user via `profiles.email`.
- Whenever the agents/datasets/knowledge schema changes, update `neon/seed.sql`.
