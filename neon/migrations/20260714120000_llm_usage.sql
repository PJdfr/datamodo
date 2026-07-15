-- BYOK PROVIDER COST TRACKING (2026-07-14): a per-call ledger of what the
-- user's OWN LLM key cost them (Anthropic / OpenAI / OpenRouter) while
-- datamodo ran it on their behalf. NOT datamodo's subscription billing.
--
-- One row per completed LLM call. cost_usd is EXACT for OpenRouter (it
-- returns the number) and an ESTIMATE for Anthropic/OpenAI (priced from token
-- counts, lib/datamodo/llm-cost.ts) — the `estimated` flag records which.
-- Writing is fail-soft: a lost row is an imperfect estimate, never a billing
-- error, so the recorder swallows insert failures. Idempotent DDL.

create table if not exists public.llm_usage (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  user_id       uuid        not null,
  provider      text        not null,           -- anthropic | openai | openrouter | ollama
  model         text        not null,
  input_tokens  integer     not null default 0,
  output_tokens integer     not null default 0,
  cost_usd      double precision,               -- null when the model is unpriced
  estimated     boolean     not null default true,  -- false = provider-reported (OpenRouter)
  created_at    timestamptz not null default now()
);

-- The summary query filters by org + a time window, newest first.
create index if not exists llm_usage_org_created_idx on public.llm_usage (org_id, created_at desc);
