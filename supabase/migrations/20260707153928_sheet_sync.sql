-- Sync a table with an external spreadsheet (Google Sheets, or an uploaded
-- .xlsx for v1).
--
-- Model: a dataset can be LINKED to one external sheet. Pulling the sheet does
-- not overwrite anything — incoming rows arrive as agent-style *proposals*
-- (proposed_by = the sheet's name), so they flow through the exact same review
-- + "Yours vs theirs" conflict UI as agent data. That gives us the user's
-- "ask me on conflict" behaviour for free, and keeps every sync auditable and
-- reversible via the existing snapshot/version history.
--
-- key_column is the column used to match an incoming sheet row to an existing
-- table row (so re-syncing updates the right row instead of duplicating it).

create table if not exists public.sheet_links (
  id             uuid primary key default gen_random_uuid(),
  dataset_id     uuid not null unique references public.datasets (id) on delete cascade,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  source_kind    text not null default 'upload',   -- 'upload' | 'google_sheets'
  source_ref     text,                              -- filename, or Google spreadsheet URL/id
  key_column     text not null,                     -- dataset column key used to match rows
  last_synced_at timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists sheet_links_org_idx on public.sheet_links (org_id);

-- RLS: org-scoped like the rest of the structured layer.
alter table public.sheet_links enable row level security;

create policy "sheet_links_select_member" on public.sheet_links
  for select to authenticated using (private.is_org_member(org_id));
create policy "sheet_links_insert_member" on public.sheet_links
  for insert to authenticated with check (private.is_org_member(org_id));
create policy "sheet_links_update_member" on public.sheet_links
  for update to authenticated using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy "sheet_links_delete_member" on public.sheet_links
  for delete to authenticated using (private.is_org_member(org_id));

grant select, insert, update, delete on public.sheet_links to authenticated;
