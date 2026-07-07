-- Explicit relationships between tables (datasets). A relation says: values in
-- `from_column` of the "from" table reference rows in the "to" table matched on
-- `to_column`. Powers the Data page's relationship graph. Org-scoped like the
-- rest of the structured layer.
create table if not exists public.dataset_relations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  from_dataset_id uuid not null references public.datasets (id) on delete cascade,
  from_column     text not null,
  to_dataset_id   uuid not null references public.datasets (id) on delete cascade,
  to_column       text not null,
  label           text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (from_dataset_id, from_column, to_dataset_id, to_column)
);

create index if not exists dataset_relations_org_idx on public.dataset_relations (org_id);
create index if not exists dataset_relations_from_idx on public.dataset_relations (from_dataset_id);
create index if not exists dataset_relations_to_idx on public.dataset_relations (to_dataset_id);

-- RLS: org-scoped like the rest of the structured layer.
alter table public.dataset_relations enable row level security;

drop policy if exists "dataset_relations_select_member" on public.dataset_relations;
create policy "dataset_relations_select_member" on public.dataset_relations
  for select to authenticated using (private.is_org_member(org_id));
drop policy if exists "dataset_relations_insert_member" on public.dataset_relations;
create policy "dataset_relations_insert_member" on public.dataset_relations
  for insert to authenticated with check (private.is_org_member(org_id));
drop policy if exists "dataset_relations_delete_member" on public.dataset_relations;
create policy "dataset_relations_delete_member" on public.dataset_relations
  for delete to authenticated using (private.is_org_member(org_id));

grant select, insert, delete on public.dataset_relations to authenticated;
