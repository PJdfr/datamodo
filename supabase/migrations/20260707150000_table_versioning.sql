-- Smart table versioning.
--
-- Non-technical model: nothing you type is ever lost, agents never overwrite
-- your edits, and you can rewind a table to any earlier version.
--
--   * dataset_snapshots — a full point-in-time copy of a table (its columns +
--     accepted rows) with a plain-language summary + who made the change.
--     Powers "version history" and one-click Restore.
--   * dataset_rows gains provenance/protection: whether a human has edited a
--     row (so agents can't silently overwrite it) and, for agent-proposed rows,
--     what they propose and against which existing row.

create table if not exists public.dataset_snapshots (
  id          uuid primary key default gen_random_uuid(),
  dataset_id  uuid not null references public.datasets (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  actor       text not null default 'You',        -- 'You' or an agent name
  summary     text not null,                       -- e.g. "Added a row"
  columns     jsonb not null default '[]'::jsonb,  -- column defs at snapshot time
  rows        jsonb not null default '[]'::jsonb,  -- [{ "data": {...} }, ...]
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists dataset_snapshots_dataset_idx
  on public.dataset_snapshots (dataset_id, created_at desc);

alter table public.dataset_rows
  add column if not exists origin        text not null default 'manual', -- 'manual' | 'agent'
  add column if not exists human_edited  boolean not null default false,  -- protected from silent overwrite
  add column if not exists proposed_kind text,                            -- null | 'add' | 'update'
  add column if not exists target_row_id uuid references public.dataset_rows (id) on delete cascade,
  add column if not exists proposed_by   text;                            -- agent name for proposals

create index if not exists dataset_rows_proposed_idx
  on public.dataset_rows (dataset_id) where status = 'proposed';

-- RLS: snapshots are org-scoped like the rest of the structured layer.
alter table public.dataset_snapshots enable row level security;

create policy "snapshots_select_member" on public.dataset_snapshots
  for select to authenticated using (private.is_org_member(org_id));
create policy "snapshots_insert_member" on public.dataset_snapshots
  for insert to authenticated with check (private.is_org_member(org_id));
create policy "snapshots_delete_member" on public.dataset_snapshots
  for delete to authenticated using (private.is_org_member(org_id));

grant select, insert, delete on public.dataset_snapshots to authenticated;
