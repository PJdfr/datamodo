-- Identify-once linking for shared-bot channels (WhatsApp, Teams, Slack…).
--
-- Unlike email (where each user gets a unique <token>@domain address that
-- identifies them), messaging channels share ONE bot for all users. So we
-- identify a user by their *sender* identity on that channel (WhatsApp wa_id,
-- Teams AAD id, …), which they bind once via a short-lived code:
--
--   1. In the app the user requests a link code for a channel  -> row here.
--   2. They send that code to the shared bot.
--   3. The channel adapter sees an inbound message from an unknown handle
--      carrying a valid code, consumes it, and creates an ACTIVE row in
--      ingest_sources mapping (channel, handle) -> that user. From then on
--      resolveTarget() routes their messages automatically.

create table if not exists public.channel_link_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,          -- short, user-facing, single-use
  org_id         uuid not null references public.organizations (id) on delete cascade,
  owner_user_id  uuid not null references auth.users (id) on delete cascade,
  channel        public.ingest_channel not null,
  expires_at     timestamptz not null,
  consumed_at    timestamptz,                    -- null until redeemed
  consumed_handle text,                          -- the sender handle it bound to
  created_at     timestamptz not null default now()
);

create index if not exists channel_link_codes_owner_idx
  on public.channel_link_codes (owner_user_id);
-- Fast lookup of live, unredeemed codes by the adapter (via service_role).
create index if not exists channel_link_codes_live_idx
  on public.channel_link_codes (code) where consumed_at is null;

alter table public.channel_link_codes enable row level security;

-- Users manage their own codes; org admins can see the org's. Mirrors the
-- scoping used by forwarding_addresses / ingest_sources.
create policy "link_codes_select_scoped" on public.channel_link_codes
  for select to authenticated
  using (private.is_org_admin(org_id) or owner_user_id = (select auth.uid()));
create policy "link_codes_insert_scoped" on public.channel_link_codes
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and private.is_org_member(org_id));
create policy "link_codes_delete_scoped" on public.channel_link_codes
  for delete to authenticated
  using (private.is_org_admin(org_id) or owner_user_id = (select auth.uid()));

grant select, insert, delete on public.channel_link_codes to authenticated;
-- service_role DML is covered by the default privileges set in
-- 20260708120000_grant_service_role_dml.sql (redemption runs server-side).
