-- Channel account-linking codes.
--
-- Email routes by RECIPIENT: every user gets a unique <token>@datamodo.dev and
-- the Cloudflare catch-all attributes a message by the address it was sent TO.
-- Messaging platforms (WhatsApp, Slack, Teams) don't hand out infinite inbound
-- addresses — there is ONE shared bot per platform — so we route by SENDER
-- instead: the user proves which platform identity is theirs, once, and after
-- that every message they forward to the bot is attributed to them.
--
-- The proof is a short one-time code. The dashboard mints one (this table); the
-- user sends it to the bot; the webhook adapter consumes it and writes the
-- durable (channel, handle) → user mapping into `ingest_sources`. From then on
-- resolveTarget() matches the sender's handle against ingest_sources directly
-- and these codes are no longer involved.

create table if not exists public.channel_link_codes (
  code            text primary key,              -- canonical, e.g. 'DM7F3K9' (shown as DM-7F3K9)
  org_id          uuid not null references public.organizations (id) on delete cascade,
  owner_user_id   uuid not null references auth.users (id) on delete cascade,
  channel         public.ingest_channel not null,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,                   -- null = still claimable
  consumed_handle text,                          -- the platform handle that claimed it
  created_at      timestamptz not null default now()
);

-- Look up a user's outstanding codes (dashboard) and expire old ones (GC).
create index if not exists channel_link_codes_owner_idx
  on public.channel_link_codes (owner_user_id, channel);
create index if not exists channel_link_codes_expiry_idx
  on public.channel_link_codes (expires_at) where consumed_at is null;

-- ---------------------------------------------------------------------------
-- RLS — a user mints and reads only their own codes. Consumption happens
-- server-side via the service role (webhook adapter), which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.channel_link_codes enable row level security;

create policy "link_codes_select_own" on public.channel_link_codes
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy "link_codes_insert_own" on public.channel_link_codes
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid()) and private.is_org_member(org_id)
  );

create policy "link_codes_delete_own" on public.channel_link_codes
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- Authenticated users mint/read/retire their own codes; the update that marks a
-- code consumed is service-role only (no update grant here).
grant select, insert, delete on public.channel_link_codes to authenticated;
