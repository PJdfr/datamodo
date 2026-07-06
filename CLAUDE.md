@AGENTS.md

## Local demo data (keep this working)

The demo account **user@example.com** (password: `password`) must always have
fake data seeded across the app tables — a personal org plus several `agents`,
their `datasets`, and `dataset_rows`. This is the canonical signed-in state for
local development.

- It lives in [`supabase/seed.sql`](supabase/seed.sql), which `supabase db reset`
  runs after migrations (`[db.seed]` in `supabase/config.toml`). The seed is
  idempotent and never clobbers an existing account.
- Whenever the agents/datasets schema changes, update `supabase/seed.sql` so the
  demo user keeps a full set of realistic rows.
