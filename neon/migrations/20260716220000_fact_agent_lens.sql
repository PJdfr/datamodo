-- AGENT LENSES (2026-07-16, GRAPH_PIPELINE.md P5): ONE graph per user, with
-- per-agent READ-SIDE views. Facts remember which agent's pipeline wrote
-- them (denormalized from the source item's meta at extraction time); every
-- knowledge read can then filter to "the vault as agent X sees it" without
-- fragmenting identity into per-agent graphs (explicitly rejected — see
-- GRAPH_PIPELINE.md §9). NULL = the generic datamodo agent / pre-lens facts.
-- Idempotent DDL + a one-time backfill from items.meta.

alter table public.facts
  add column if not exists agent_id uuid references public.agents(id) on delete set null;

create index if not exists facts_agent_idx
  on public.facts (agent_id) where agent_id is not null;

-- Backfill: attribution already lives on the source items (meta.agent_id for
-- addressed messages, meta.routed_agent_id for auto-routed ones).
update public.facts f
   set agent_id = coalesce(
         nullif(i.meta->>'agent_id', '')::uuid,
         nullif(i.meta->>'routed_agent_id', '')::uuid)
  from public.items i
 where i.id = f.source_item_id
   and f.agent_id is null
   and (i.meta ? 'agent_id' or i.meta ? 'routed_agent_id');
