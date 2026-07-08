-- Knowledge review queue + onboarding context.
--
-- knowledge_reviews surfaces the knowledge layer's uncertain decisions for the
-- user to validate — proposed entity merges ("Acme" ≈ "Acme Group"?) and fact
-- conflicts (a value was superseded) — ranked by IMPACT (how many facts/edges
-- the decision touches) so the most consequential ones are reviewed first.
--
-- user_settings gains onboarding context (a short business description + QCM
-- answers) that steers the extractor's prompt so it parses the right entities,
-- relationships, and predicate labels for this user's domain.

create table if not exists public.knowledge_reviews (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  owner_user_id  uuid references auth.users (id) on delete set null,
  kind           text not null,                       -- 'entity_merge' | 'fact_conflict'
  status         text not null default 'pending',     -- 'pending' | 'accepted' | 'rejected'
  confidence     real,                                -- resolver confidence 0..1
  impact         integer not null default 0,          -- rows/edges affected; higher = triage first
  -- entity_merge: propose merging source (newly parsed) INTO target (canonical)
  source_entity_id uuid references public.entities (id) on delete cascade,
  target_entity_id uuid references public.entities (id) on delete cascade,
  -- fact_conflict: a new value superseded an old one
  new_fact_id    uuid references public.facts (id) on delete set null,
  old_fact_id    uuid references public.facts (id) on delete set null,
  detail         jsonb not null default '{}'::jsonb,  -- human-readable summary for the UI
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
-- Ranked triage: pending items for an org, most impactful first.
create index if not exists knowledge_reviews_triage_idx
  on public.knowledge_reviews (org_id, status, impact desc, confidence);

alter table public.knowledge_reviews enable row level security;
create policy "reviews_select_member" on public.knowledge_reviews
  for select to authenticated using (private.is_org_member(org_id));
grant select on public.knowledge_reviews to authenticated;  -- writes are server-side

-- --- Onboarding context on user_settings ---
alter table public.user_settings
  add column if not exists business_context text,
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

-- Broaden entity blocking RECALL so short-in-long names surface as candidates
-- ("Acme" should find "Acme Group"). The similarity SCORE stays modest so such
-- cases route to LLM adjudication rather than trivially auto-matching.
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
    and (
      e.canonical_label % p_label
      or e.canonical_label ilike '%' || p_label || '%'
      or p_label ilike '%' || e.canonical_label || '%'
    )
  order by sim desc
  limit p_limit;
$$;
