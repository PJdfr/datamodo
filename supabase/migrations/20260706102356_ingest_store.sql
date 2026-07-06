-- Datamodo — raw capture store.
--
-- Stores every email, message, and media a user shares with Datamodo, BEFORE
-- any analysis. Design goals: per-tenant isolation + minimal space.
--
--   * Postgres holds only small metadata rows (the index).
--   * Bytes live in Supabase Storage (private bucket 'ingest'), never in the DB.
--   * Content-addressed dedup: each unique blob is stored once under its sha256,
--     ref-counted, and gzip-compressed. Scoped per org (no cross-tenant sharing).
--   * Provider-independent: adapters normalize any source (email via any
--     provider, WhatsApp/Slack/Teams, direct upload) into items + attachments.
--   * Two capture modes: 'active' (user forwards one thing) and 'auto'
--     (Datamodo receives everything and decides what matters).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingest_channel') then
    create type public.ingest_channel as enum
      ('email', 'whatsapp', 'slack', 'teams', 'sms', 'upload', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'capture_mode') then
    create type public.capture_mode as enum ('active', 'auto');
  end if;
  if not exists (select 1 from pg_type where typname = 'item_status') then
    create type public.item_status as enum
      ('received', 'stored', 'analyzing', 'analyzed', 'failed', 'skipped');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- ingest_sources: channel-agnostic registry of where Datamodo listens for a
-- user — a forwarding email address, a WhatsApp number, a connected mailbox.
-- 'provider' is free-form bookkeeping and is never load-bearing.
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_sources (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade,   -- null = shared/org
  channel       public.ingest_channel not null,
  mode          public.capture_mode not null default 'active',
  handle        text not null,        -- normalized address/number/account we match on
  display_name  text,
  provider      text,                 -- 'sendgrid' | 'cloudflare' | 'whatsapp-cloud' | ...
  secret        text,                 -- per-source webhook verification secret (optional)
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  unique (channel, handle)
);

create index if not exists ingest_sources_org_idx on public.ingest_sources (org_id);

-- ---------------------------------------------------------------------------
-- blobs: content-addressed, ref-counted byte store. One row per unique blob
-- per org. The bytes themselves live in Storage at storage_path.
-- ---------------------------------------------------------------------------
create table if not exists public.blobs (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  hash         text not null,         -- sha256 hex of the ORIGINAL (uncompressed) bytes
  storage_path text not null,         -- object path in the 'ingest' bucket
  bytes        bigint not null,       -- original size
  stored_bytes bigint not null,       -- size actually stored (after optional gzip)
  encoding     text not null default 'identity',   -- 'gzip' | 'identity'
  content_type text,
  ref_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  primary key (org_id, hash)
);

-- ---------------------------------------------------------------------------
-- items: one row per received email / message / upload.
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  owner_user_id    uuid references auth.users (id) on delete set null,
  source_id        uuid references public.ingest_sources (id) on delete set null,
  channel          public.ingest_channel not null,
  capture_mode     public.capture_mode not null default 'active',
  external_id      text,              -- provider message id (idempotency key)
  external_account text,              -- the connected account this arrived through
  sender           text,
  recipients       text[],
  subject          text,
  body_preview     text,              -- short plain snippet for list views
  body_hash        text,              -- -> blobs (full body), nullable
  raw_hash         text,              -- -> blobs (raw provider payload / .eml), nullable
  meta             jsonb not null default '{}'::jsonb,
  bytes            bigint not null default 0,   -- total bytes captured for this item
  sent_at          timestamptz,
  received_at      timestamptz not null default now(),
  status           public.item_status not null default 'received',
  error            text,
  created_at       timestamptz not null default now()
);

-- Idempotency: a provider message is ingested at most once per org+channel.
create unique index if not exists items_idem_idx
  on public.items (org_id, channel, external_id) where external_id is not null;
create index if not exists items_org_received_idx on public.items (org_id, received_at desc);
create index if not exists items_status_idx on public.items (status);

-- ---------------------------------------------------------------------------
-- attachments: media/files belonging to an item. Points at a (deduped) blob.
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.items (id) on delete cascade,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  filename      text,
  content_type  text,
  bytes         bigint not null default 0,
  blob_hash     text not null,        -- -> blobs
  created_at    timestamptz not null default now()
);

create index if not exists attachments_item_idx on public.attachments (item_id);
create index if not exists attachments_org_idx on public.attachments (org_id);

-- ---------------------------------------------------------------------------
-- Ref-counting: keep blobs.ref_count accurate via triggers so it can never
-- drift, regardless of which server path writes the rows. A blob with
-- ref_count = 0 is an orphan and can be garbage-collected from Storage.
-- ---------------------------------------------------------------------------
create or replace function private.blob_ref(p_org uuid, p_hash text, p_delta int)
returns void language sql security definer set search_path = '' as $$
  update public.blobs set ref_count = ref_count + p_delta
   where org_id = p_org and hash = p_hash;
$$;

create or replace function private.attachments_refcount()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.blob_ref(new.org_id, new.blob_hash, 1);
  elsif tg_op = 'DELETE' then
    perform private.blob_ref(old.org_id, old.blob_hash, -1);
  end if;
  return null;
end
$$;

drop trigger if exists attachments_refcount_trg on public.attachments;
create trigger attachments_refcount_trg
  after insert or delete on public.attachments
  for each row execute function private.attachments_refcount();

create or replace function private.items_refcount()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.body_hash is not null then perform private.blob_ref(new.org_id, new.body_hash, 1); end if;
    if new.raw_hash  is not null then perform private.blob_ref(new.org_id, new.raw_hash,  1); end if;
  elsif tg_op = 'DELETE' then
    if old.body_hash is not null then perform private.blob_ref(old.org_id, old.body_hash, -1); end if;
    if old.raw_hash  is not null then perform private.blob_ref(old.org_id, old.raw_hash,  -1); end if;
  end if;
  return null;
end
$$;

drop trigger if exists items_refcount_trg on public.items;
create trigger items_refcount_trg
  after insert or delete on public.items
  for each row execute function private.items_refcount();

-- ---------------------------------------------------------------------------
-- RLS — members read their org's capture data; owners/admins can delete it
-- (right to be forgotten). All ingestion writes happen server-side via the
-- service role, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.ingest_sources enable row level security;
alter table public.blobs          enable row level security;
alter table public.items          enable row level security;
alter table public.attachments    enable row level security;

create policy "sources_select_member" on public.ingest_sources
  for select to authenticated using (private.is_org_member(org_id));
create policy "sources_insert_scoped" on public.ingest_sources
  for insert to authenticated
  with check (
    private.is_org_admin(org_id)
    or (owner_user_id = (select auth.uid()) and private.is_org_member(org_id))
  );
create policy "sources_delete_scoped" on public.ingest_sources
  for delete to authenticated
  using (private.is_org_admin(org_id) or owner_user_id = (select auth.uid()));

create policy "blobs_select_member" on public.blobs
  for select to authenticated using (private.is_org_member(org_id));

create policy "items_select_member" on public.items
  for select to authenticated using (private.is_org_member(org_id));
create policy "items_delete_scoped" on public.items
  for delete to authenticated
  using (private.is_org_admin(org_id) or owner_user_id = (select auth.uid()));

create policy "attachments_select_member" on public.attachments
  for select to authenticated using (private.is_org_member(org_id));
create policy "attachments_delete_scoped" on public.attachments
  for delete to authenticated
  using (private.is_org_admin(org_id) or owner_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Table privileges (RLS still gates every row). No insert/update on the
-- capture tables for authenticated — those are service-role-only.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.ingest_sources to authenticated;
grant select                 on public.blobs          to authenticated;
grant select, delete         on public.items          to authenticated;
grant select, delete         on public.attachments    to authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage bucket for the raw bytes.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ingest', 'ingest', false)
on conflict (id) do nothing;
