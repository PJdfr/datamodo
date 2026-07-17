-- ADAPTIVE AGENT ROUTING (2026-07-17, GRAPH_PIPELINE.md "Adaptive
-- classifiers (1)"): routing is a decision WITH feedback — learn from it.
-- routing_events is the feedback log: every time a message is tied to an
-- agent (composer suggestion accepted, explicitly addressed, auto-routed and
-- never corrected) or pushed away from one (suggestion dismissed), one row
-- lands here with the message head. The nightly consolidation tick embeds the
-- accepted heads and folds them into a PER-AGENT CENTROID on the agents row
-- (+ per-term weight corrections in routing_terms); the zero-cost router then
-- scores lexical overlap + cosine(message, centroid). No training infra, no
-- LLM — the ONE message embedding the pipeline already computes for priming
-- is reused. All readers fail soft until this migration is applied.
-- Idempotent DDL.

create table if not exists public.routing_events (
    id              uuid        primary key default gen_random_uuid(),
    org_id          uuid        not null references public.organizations(id) on delete cascade,
    agent_id        uuid        not null references public.agents(id) on delete cascade,
    item_id         uuid        references public.items(id) on delete set null,
    -- accept = "this text belongs to this agent"; reject = "not this one".
    verdict         text        not null check (verdict in ('accept', 'reject')),
    -- chip_accept | addressed | implicit | chip_dismiss — where the label came from.
    source          text        not null,
    text_head       text        not null,
    embedding       public.vector(1536),
    embedding_model text,
    -- Set once the consolidation tick folded this event into the agent's
    -- centroid/terms — consumed events are never re-learned.
    consumed_at     timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists routing_events_org_pending_idx
  on public.routing_events (org_id, created_at) where consumed_at is null;
create index if not exists routing_events_item_idx
  on public.routing_events (item_id) where item_id is not null;

-- The learned routing profile, per agent. centroid = incremental mean of the
-- accepted messages' embeddings (stamped with its space; a model change
-- restarts it — vectors from different models never mix); routing_terms =
-- {term: weight delta} corrections the router adds on top of the lexical
-- profile (positive from accepts, negative from rejects).
alter table public.agents
  add column if not exists routing_centroid public.vector(1536);
alter table public.agents
  add column if not exists routing_centroid_model text;
alter table public.agents
  add column if not exists routing_centroid_n integer not null default 0;
alter table public.agents
  add column if not exists routing_terms jsonb not null default '{}'::jsonb;
