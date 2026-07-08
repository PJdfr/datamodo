-- Knowledge layer: the canonical, per-user store from which tables, the graph
-- view, and analytics are all derived. See docs/architecture.md (the 3-layer
-- model) and PROJECT_STATE.md.
--
-- Design points this schema encodes:
--   * Per-user isolation: everything leads with org_id (= the user's personal
--     org). Entity resolution + semantic search are ALWAYS scoped to one org,
--     so they stay fast and private as data grows.
--   * entities are canonical + mergeable (merged_into re-points duplicates).
--   * facts are APPEND-ONLY + bitemporal (valid_from/valid_to; supersede,
--     never mutate) so history + provenance are preserved and reproducible.
--   * fact_sources gives provenance + support count and makes re-observation a
--     dedup (one fact, many sources) rather than a duplicate row.
--   * Deterministic dedup keys (normalized_key, claim_key) do the cheap work;
--     pg_trgm + pgvector power the blocking tier for fuzzy matches.

create extension if not exists vector  with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- entities: canonical things (person, org, invoice, project…), per user.
-- ---------------------------------------------------------------------------
create table if not exists public.entities (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  owner_user_id  uuid references auth.users (id) on delete set null,
  kind           text not null,                         -- 'person'|'org'|'invoice'|...
  canonical_label text not null,                        -- best human-readable name
  normalized_key text not null,                         -- deterministic tier-0 dedup key
  natural_keys   jsonb not null default '{}'::jsonb,    -- strong ids {email,phone,invoice_no}
  embedding      extensions.vector(1536),               -- tier-1 semantic blocking (nullable)
  support        integer not null default 0,            -- how many mentions rolled up here
  merged_into    uuid references public.entities (id) on delete set null,  -- null = canonical
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Tier-0 dedup, per user: one canonical entity per (org, kind, normalized_key).
create unique index if not exists entities_norm_key_uq
  on public.entities (org_id, kind, normalized_key) where merged_into is null;
create index if not exists entities_org_idx on public.entities (org_id);
-- Tier-1 fuzzy blocking (trigram) — always combined with an org_id filter.
create index if not exists entities_label_trgm
  on public.entities using gin (canonical_label extensions.gin_trgm_ops);
-- Tier-1 semantic blocking (ANN). Queries post-filter by org_id.
create index if not exists entities_embedding_idx
  on public.entities using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- facts: append-only, bitemporal assertions. The canonical truth.
-- claim_key identifies the "slot" (single-valued) or the exact assertion
-- (multi-valued); see lib/datamodo/knowledge.ts for how it's computed.
-- ---------------------------------------------------------------------------
create table if not exists public.facts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  owner_user_id     uuid references auth.users (id) on delete set null,
  subject_entity_id uuid not null references public.entities (id) on delete cascade,
  predicate         text not null,
  object_entity_id  uuid references public.entities (id) on delete set null, -- entity-valued
  value_text        text,
  value_num         numeric,
  value_date        date,
  unit              text,
  cardinality       text not null default 'one',   -- 'one' (supersede) | 'many' (accumulate)
  claim_key         text not null,
  confidence        real not null default 1.0,
  valid_from        timestamptz not null default now(),
  valid_to          timestamptz,                    -- null = currently believed true
  superseded_by     uuid references public.facts (id) on delete set null,
  source_item_id    uuid references public.items (id) on delete set null,
  created_at        timestamptz not null default now()
);
-- At most one CURRENT fact per claim per user (dedup + supersession invariant).
create unique index if not exists facts_current_claim_uq
  on public.facts (org_id, claim_key) where valid_to is null;
create index if not exists facts_subject_idx on public.facts (subject_entity_id);
create index if not exists facts_org_idx on public.facts (org_id);
create index if not exists facts_source_idx on public.facts (source_item_id);

-- ---------------------------------------------------------------------------
-- fact_sources: provenance. Re-observing a fact adds a source (support++),
-- never a duplicate fact.
-- ---------------------------------------------------------------------------
create table if not exists public.fact_sources (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  fact_id        uuid not null references public.facts (id) on delete cascade,
  source_item_id uuid references public.items (id) on delete set null,
  snippet        text,
  extracted_at   timestamptz not null default now(),
  unique (fact_id, source_item_id)
);
create index if not exists fact_sources_fact_idx on public.fact_sources (fact_id);

-- ---------------------------------------------------------------------------
-- RLS — mirrors ingest_sources/forwarding_addresses. Reads are user-scoped;
-- writes happen server-side via service_role (which bypasses RLS). Grants to
-- service_role come from the default privileges in 20260708120000.
-- ---------------------------------------------------------------------------
alter table public.entities     enable row level security;
alter table public.facts        enable row level security;
alter table public.fact_sources enable row level security;

create policy "entities_select_member" on public.entities
  for select to authenticated using (private.is_org_member(org_id));
create policy "facts_select_member" on public.facts
  for select to authenticated using (private.is_org_member(org_id));
create policy "fact_sources_select_member" on public.fact_sources
  for select to authenticated using (private.is_org_member(org_id));

grant select on public.entities     to authenticated;
grant select on public.facts        to authenticated;
grant select on public.fact_sources to authenticated;

-- ---------------------------------------------------------------------------
-- Tier-1 blocking helper: trigram candidate lookup, scoped to one org.
-- SECURITY INVOKER: authenticated callers are RLS-scoped; service_role bypasses
-- RLS and passes the org explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.knowledge_match_entities(
  p_org uuid, p_kind text, p_label text, p_limit int default 10
) returns table (id uuid, canonical_label text, sim real)
language sql stable
set search_path = public, extensions
as $$
  select e.id, e.canonical_label, similarity(e.canonical_label, p_label) as sim
  from public.entities e
  where e.org_id = p_org
    and e.kind = p_kind
    and e.merged_into is null
    and e.canonical_label % p_label
  order by sim desc
  limit p_limit;
$$;
revoke all on function public.knowledge_match_entities(uuid, text, text, int) from public;
grant execute on function public.knowledge_match_entities(uuid, text, text, int)
  to authenticated, service_role;
