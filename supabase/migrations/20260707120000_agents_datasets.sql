-- Datamodo — agents + datasets (the structured layer above raw capture).
--
-- This turns the mocked Control Center into real config + data:
--   * agents      — a filter + extraction spec bound to one or more channels.
--   * agent_shares — teammates an agent is shared with (scope = 'people').
--   * datasets    — user-defined tables (dynamic columns held as jsonb).
--   * dataset_rows — the structured rows an agent produces, with provenance
--                    back to the source `item` and a status for the review flow.
--
-- Security mirrors the orgs/ingest migrations: RLS on every table, `TO
-- authenticated` + a membership/ownership predicate, membership checks via the
-- SECURITY DEFINER helpers in the private schema, and USING + WITH CHECK on
-- every UPDATE policy. Unlike the capture tables (service-role writes only),
-- these are user-facing CRUD, so authenticated INSERT/UPDATE/DELETE is granted
-- and gated entirely by RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agent_mode') then
    create type public.agent_mode as enum ('auto', 'ping');
  end if;
  if not exists (select 1 from pg_type where typname = 'agent_purpose') then
    -- 'curate' = curated prompt/focus; 'auto' = infer focus from context.
    create type public.agent_purpose as enum ('curate', 'auto');
  end if;
  if not exists (select 1 from pg_type where typname = 'agent_scope') then
    create type public.agent_scope as enum ('org', 'people', 'me');
  end if;
  if not exists (select 1 from pg_type where typname = 'agent_status') then
    create type public.agent_status as enum ('active', 'paused');
  end if;
  if not exists (select 1 from pg_type where typname = 'dataset_row_status') then
    -- 'accepted' = live in the table; 'proposed' = pending review (suggestions).
    create type public.dataset_row_status as enum ('accepted', 'proposed');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Generic updated_at touch trigger (shared by every table below).
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------------
create table if not exists public.agents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  purpose_text  text,                                   -- curated focus / description
  purpose       public.agent_purpose not null default 'curate',
  channels      text[] not null default '{}',           -- 'gmail' | 'whatsapp' | ...
  mode          public.agent_mode   not null default 'auto',
  scope         public.agent_scope  not null default 'org',
  status        public.agent_status not null default 'active',
  freestyle     boolean not null default false,         -- invents its own datasets
  avatar_bg     text,                                   -- UI accent (optional)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists agents_org_idx on public.agents (org_id);
create index if not exists agents_owner_idx on public.agents (owner_user_id);

drop trigger if exists agents_touch_updated_at on public.agents;
create trigger agents_touch_updated_at before update on public.agents
  for each row execute function private.touch_updated_at();

-- Teammates an agent is explicitly shared with (only meaningful for scope='people').
create table if not exists public.agent_shares (
  agent_id   uuid not null references public.agents (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, user_id)
);

create index if not exists agent_shares_user_idx on public.agent_shares (user_id);

-- ---------------------------------------------------------------------------
-- datasets — dynamic user-defined tables. Columns live as jsonb for v1
-- ([{ "key": "...", "label": "...", "type": "text" }, ...]); rows are jsonb
-- keyed by column key. Revisit real columns vs. EAV once export/query needs it.
-- ---------------------------------------------------------------------------
create table if not exists public.datasets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  agent_id    uuid references public.agents (id) on delete set null,  -- owning agent
  name        text not null,
  description text,
  columns     jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One dataset name per org (case-insensitive).
create unique index if not exists datasets_org_name_idx
  on public.datasets (org_id, lower(name));
create index if not exists datasets_agent_idx on public.datasets (agent_id);

drop trigger if exists datasets_touch_updated_at on public.datasets;
create trigger datasets_touch_updated_at before update on public.datasets
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- dataset_rows — one structured row, with provenance + review status.
-- ---------------------------------------------------------------------------
create table if not exists public.dataset_rows (
  id             uuid primary key default gen_random_uuid(),
  dataset_id     uuid not null references public.datasets (id) on delete cascade,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  data           jsonb not null default '{}'::jsonb,
  status         public.dataset_row_status not null default 'accepted',
  source_item_id uuid references public.items (id) on delete set null,  -- provenance
  version        integer not null default 1,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists dataset_rows_dataset_idx on public.dataset_rows (dataset_id);
create index if not exists dataset_rows_org_idx on public.dataset_rows (org_id);

drop trigger if exists dataset_rows_touch_updated_at on public.dataset_rows;
create trigger dataset_rows_touch_updated_at before update on public.dataset_rows
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.agents        enable row level security;
alter table public.agent_shares  enable row level security;
alter table public.datasets      enable row level security;
alter table public.dataset_rows  enable row level security;

-- agents: visible to org members subject to the agent's own scope. Owner (or an
-- org admin) manages it. The scope check reads agent_shares (a different table)
-- so there is no policy recursion on agents.
create policy "agents_select_scoped" on public.agents
  for select to authenticated
  using (
    private.is_org_member(org_id)
    and (
      scope = 'org'
      or owner_user_id = (select auth.uid())
      or (scope = 'people' and exists (
        select 1 from public.agent_shares s
        where s.agent_id = id and s.user_id = (select auth.uid())
      ))
    )
  );

create policy "agents_insert_own" on public.agents
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and private.is_org_member(org_id)
  );

create policy "agents_update_owner_or_admin" on public.agents
  for update to authenticated
  using (owner_user_id = (select auth.uid()) or private.is_org_admin(org_id))
  with check (owner_user_id = (select auth.uid()) or private.is_org_admin(org_id));

create policy "agents_delete_owner_or_admin" on public.agents
  for delete to authenticated
  using (owner_user_id = (select auth.uid()) or private.is_org_admin(org_id));

-- agent_shares: readable by any member of the agent's org; managed by the
-- agent's owner or an org admin.
create policy "agent_shares_select_member" on public.agent_shares
  for select to authenticated
  using (exists (
    select 1 from public.agents a
    where a.id = agent_id and private.is_org_member(a.org_id)
  ));

create policy "agent_shares_insert_manager" on public.agent_shares
  for insert to authenticated
  with check (exists (
    select 1 from public.agents a
    where a.id = agent_id
      and (a.owner_user_id = (select auth.uid()) or private.is_org_admin(a.org_id))
  ));

create policy "agent_shares_delete_manager" on public.agent_shares
  for delete to authenticated
  using (exists (
    select 1 from public.agents a
    where a.id = agent_id
      and (a.owner_user_id = (select auth.uid()) or private.is_org_admin(a.org_id))
  ));

-- datasets: any org member reads and writes; delete restricted to the creator
-- or an org admin.
create policy "datasets_select_member" on public.datasets
  for select to authenticated
  using (private.is_org_member(org_id));

create policy "datasets_insert_member" on public.datasets
  for insert to authenticated
  with check (created_by = (select auth.uid()) and private.is_org_member(org_id));

create policy "datasets_update_member" on public.datasets
  for update to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));

create policy "datasets_delete_scoped" on public.datasets
  for delete to authenticated
  using (created_by = (select auth.uid()) or private.is_org_admin(org_id));

-- dataset_rows: collaborative org data — any member of the org reads/writes.
create policy "dataset_rows_select_member" on public.dataset_rows
  for select to authenticated
  using (private.is_org_member(org_id));

create policy "dataset_rows_insert_member" on public.dataset_rows
  for insert to authenticated
  with check (private.is_org_member(org_id));

create policy "dataset_rows_update_member" on public.dataset_rows
  for update to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));

create policy "dataset_rows_delete_member" on public.dataset_rows
  for delete to authenticated
  using (private.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- Table privileges (RLS still gates every row).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.agents       to authenticated;
grant select, insert, delete         on public.agent_shares to authenticated;
grant select, insert, update, delete on public.datasets     to authenticated;
grant select, insert, update, delete on public.dataset_rows to authenticated;
