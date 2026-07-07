-- Plans, per-user settings, and compute-provider selection.
--
--   * user_settings — one row per user: their plan, how their data is analysed
--     (Datamodo cloud vs their own API key), which provider, and Stripe linkage.
--   * byok_key is write-only from the app's perspective: the client never reads
--     it back (server code selects it only when it needs to call the provider).
--     TODO before the extraction pipeline ships: move this to Supabase Vault/KMS.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_plan') then
    create type public.billing_plan as enum ('free', 'pro', 'max');
  end if;
end
$$;

create table if not exists public.user_settings (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  plan                   public.billing_plan not null default 'free',
  compute_mode           text not null default 'byok',       -- 'cloud' | 'byok'
  ai_provider            text not null default 'anthropic',  -- 'anthropic' | 'openai'
  byok_key               text,                               -- write-only; never returned to client
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_status            text,                               -- 'active' | 'trialing' | 'past_due' | 'canceled'
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Owner-only. (The app strips byok_key before sending settings to the browser.)
create policy "settings_select_own" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "settings_insert_own" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "settings_update_own" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_settings to authenticated;

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at before update on public.user_settings
  for each row execute function private.touch_updated_at();

-- Create a default settings row for every new user.
create or replace function public.handle_new_user_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created_settings on auth.users;
create trigger on_auth_user_created_settings
  after insert on auth.users
  for each row execute function public.handle_new_user_settings();

-- Backfill existing users, and put the demo account on Pro so its seeded
-- auto-mode agents remain valid.
insert into public.user_settings (user_id)
  select id from auth.users on conflict do nothing;

update public.user_settings s
   set plan = 'pro', compute_mode = 'cloud'
  from auth.users u
 where u.id = s.user_id and u.email = 'user@example.com';
